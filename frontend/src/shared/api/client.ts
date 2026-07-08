import { apiDelete, apiGet, apiPatch, apiPost } from '../../hooks/useApi';

export { ApiError, formatErrorForToast, formatContextualErrorForToast, getUserFacingError, logApiError } from './errors';

export const apiClient = {
  get: <T>(path: string) => apiGet<T>(path),
  post: <T>(path: string, body: unknown) => apiPost<T>(path, body),
  patch: <T>(path: string, body: unknown) => apiPatch<T>(path, body),
  delete: (path: string) => apiDelete(path),
};
