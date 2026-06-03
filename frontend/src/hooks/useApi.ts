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

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PATCH ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const response = await apiFetch(path, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`DELETE ${path} failed with ${response.status}`);
  }
}
