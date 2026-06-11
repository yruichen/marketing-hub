import { useState, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export { API_BASE_URL };

export type Tab = 'dashboard' | 'projects' | 'builder' | 'copy' | 'image' | 'storyboard' | 'audio' | 'community' | 'config';

export interface ToastMessage {
  text: string;
  type: 'success' | 'info' | 'error';
}

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
  const response = await fetch(`${API_BASE_URL}/ai/config/`, {
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

  const triggerToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3000);
  }, []);

  return { feedbackMsg, triggerToast };
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
    const body = await response.text().catch(() => '');
    throw new Error(`GET ${path} failed (${response.status}): ${body.slice(0, 200) || 'no details'}`);
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
      const errBody = await response.text().catch(() => '');
      throw new Error(`POST ${path} failed (${response.status}): ${errBody.slice(0, 200) || 'no details'}`);
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
      const errBody = await response.text().catch(() => '');
      throw new Error(`PATCH ${path} failed (${response.status}): ${errBody.slice(0, 200) || 'no details'}`);
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
      const errBody = await response.text().catch(() => '');
      throw new Error(`DELETE ${path} failed (${response.status}): ${errBody.slice(0, 200) || 'no details'}`);
    }
  });
}
