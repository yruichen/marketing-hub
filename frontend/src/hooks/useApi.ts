import { useState, useCallback } from 'react';
import { parseApiErrorResponse } from '../shared/api/errors';
import type { ToastMessage } from '../shared/types/toast';

export {
  ApiError,
  formatErrorForToast,
  formatContextualErrorForToast,
  getUserFacingError,
  logApiError,
  parseApiErrorResponse,
} from '../shared/api/errors';
export { buildErrorToast, resolveErrorActions, type ErrorAction, type ErrorActionId } from '../shared/api/errorActions';
export type { ToastMessage } from '../shared/types/toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export { API_BASE_URL };

export type Tab = 'dashboard' | 'projects' | 'builder' | 'copy' | 'image' | 'storyboard' | 'audio' | 'community' | 'config';

let cachedCsrfToken: string | null = null;

function captureCsrfToken(response: Response) {
  const token = response.headers.get('X-CSRFToken');
  if (token) {
    cachedCsrfToken = token;
  }
}

export async function ensureCsrfToken() {
  if (cachedCsrfToken) {
    return cachedCsrfToken;
  }
  const response = await fetch(`${API_BASE_URL}/auth/csrf/`, {
    credentials: 'include',
  });
  captureCsrfToken(response);
  return cachedCsrfToken;
}

/**
 * Synchronous read of the cached CSRF token. Returns null if it has
 * not been fetched yet — callers in async code paths should
 * `await ensureCsrfToken()` first.
 */
export function getCsrfToken(): string | null {
  return cachedCsrfToken;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  if (import.meta.env.DEV) {
    headers.set('X-MH-Debug-Errors', '1');
  }
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    if (!cachedCsrfToken) {
      await ensureCsrfToken();
    }
    if (cachedCsrfToken) {
      headers.set('X-CSRFToken', cachedCsrfToken);
    }
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  captureCsrfToken(response);
  const authProbePaths = ['/auth/login/', '/admin-auth/login/', '/auth/register/', '/auth/csrf/', '/auth/me/'];
  if (response.status === 401 && !authProbePaths.some((authPath) => path.startsWith(authPath))) {
    localStorage.removeItem('mh_token');
    localStorage.removeItem('mh_username');
    window.dispatchEvent(new CustomEvent('mh:auth-expired'));
  }
  return response;
}

/**
 * Streaming variant of apiFetch: same auth/CSRF dance, but returns
 * the raw `Response` so the caller can read `body.getReader()`.
 * Use for `text/event-stream` endpoints like the assistant chat.
 */
export async function apiStream(path: string, init: RequestInit = {}): Promise<Response> {
  return apiFetch(path, init);
}

export function useToast() {
  const [feedbackMsg, setFeedbackMsg] = useState<ToastMessage | null>(null);

  const triggerToast = useCallback((input: string | ToastMessage, type: ToastMessage['type'] = 'success') => {
    const message: ToastMessage = typeof input === 'string'
      ? { text: input, type }
      : { ...input, type: input.type || type };
    setFeedbackMsg(message);
    const duration = message.actions?.length ? 8000 : 3000;
    setTimeout(() => setFeedbackMsg(null), duration);
  }, []);

  const dismissToast = useCallback(() => setFeedbackMsg(null), []);

  return { feedbackMsg, triggerToast, dismissToast };
}

export function useCopyClipboard(triggerToast: (text: string, type: 'success' | 'info' | 'error') => void) {
  const handleCopyClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      triggerToast('已复制到剪贴板', 'success');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      triggerToast('已复制到剪贴板', 'success');
    }
  }, [triggerToast]);

  return handleCopyClipboard;
}

const REQUEST_TIMEOUT_MS = 120_000;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw await parseApiErrorResponse(response, path);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return withTimeout(async (signal) => {
    const response = await apiFetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw await parseApiErrorResponse(response, path);
    }
    return response.json() as Promise<T>;
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return withTimeout(async (signal) => {
    const response = await apiFetch(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw await parseApiErrorResponse(response, path);
    }
    return response.json() as Promise<T>;
  });
}

export async function apiDelete(path: string): Promise<void> {
  return withTimeout(async (signal) => {
    const response = await apiFetch(path, {
      method: 'DELETE',
      signal,
    });
    if (!response.ok) {
      throw await parseApiErrorResponse(response, path);
    }
  });
}
