import { parseApiErrorResponse } from './errors';

export {
  ApiError,
  formatErrorForToast,
  formatContextualErrorForToast,
  getUserFacingError,
  logApiError,
  parseApiErrorResponse,
} from './errors';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

let cachedCsrfToken: string | null = null;

function captureCsrfToken(response: Response) {
  const token = response.headers.get('X-CSRFToken');
  if (token) cachedCsrfToken = token;
}

export async function ensureCsrfToken() {
  if (cachedCsrfToken) return cachedCsrfToken;
  const response = await fetch(`${API_BASE_URL}/auth/csrf/`, { credentials: 'include' });
  captureCsrfToken(response);
  return cachedCsrfToken;
}

export function getCsrfToken(): string | null {
  return cachedCsrfToken;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  if (import.meta.env.DEV) headers.set('X-MH-Debug-Errors', '1');
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');

  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    if (!cachedCsrfToken) await ensureCsrfToken();
    if (cachedCsrfToken) headers.set('X-CSRFToken', cachedCsrfToken);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  captureCsrfToken(response);

  const authProbePaths = ['/auth/login/', '/admin-auth/login/', '/auth/register/', '/auth/csrf/', '/auth/me/'];
  if (response.status === 401 && !authProbePaths.some((authPath) => path.startsWith(authPath))) {
    localStorage.removeItem('mh_username');
    window.dispatchEvent(new CustomEvent('mh:auth-expired'));
  }
  return response;
}

export async function apiStream(path: string, init: RequestInit = {}): Promise<Response> {
  return apiFetch(path, init);
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
  if (!response.ok) throw await parseApiErrorResponse(response, path);
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return withTimeout(async (signal) => {
    const response = await apiFetch(path, { method: 'POST', body: JSON.stringify(body), signal });
    if (!response.ok) throw await parseApiErrorResponse(response, path);
    return response.json() as Promise<T>;
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return withTimeout(async (signal) => {
    const response = await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body), signal });
    if (!response.ok) throw await parseApiErrorResponse(response, path);
    return response.json() as Promise<T>;
  });
}

export async function apiDelete(path: string): Promise<void> {
  return withTimeout(async (signal) => {
    const response = await apiFetch(path, { method: 'DELETE', signal });
    if (!response.ok) throw await parseApiErrorResponse(response, path);
  });
}

export const apiClient = {
  get: <T>(path: string) => apiGet<T>(path),
  post: <T>(path: string, body: unknown) => apiPost<T>(path, body),
  patch: <T>(path: string, body: unknown) => apiPatch<T>(path, body),
  delete: (path: string) => apiDelete(path),
};
