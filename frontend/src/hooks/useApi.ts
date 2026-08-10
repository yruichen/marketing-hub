import { useCallback, useState } from 'react';
import type { ToastMessage } from '../shared/types/toast';

export {
  API_BASE_URL,
  apiClient,
  apiDelete,
  apiFetch,
  apiGet,
  apiPatch,
  apiPost,
  apiStream,
  ensureCsrfToken,
  getCsrfToken,
} from '../shared/api/client';
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

export type Tab = 'dashboard' | 'projects' | 'builder' | 'copy' | 'image' | 'storyboard' | 'audio' | 'community' | 'config';

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
  return useCallback(async (text: string) => {
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
}
