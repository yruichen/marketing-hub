import { useState, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export { API_BASE_URL };

export type Tab = 'dashboard' | 'projects' | 'builder' | 'copy' | 'image' | 'storyboard' | 'audio' | 'community' | 'config';

export interface ToastMessage {
  text: string;
  type: 'success' | 'info' | 'error';
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
      // Fallback for older browsers
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
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PATCH ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`DELETE ${path} failed with ${response.status}`);
  }
}
