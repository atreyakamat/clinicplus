import { useAuthStore } from '../store/auth.store';

const API_BASE_URL = '/api/v1';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(
      (Array.isArray(data?.errors) && data.errors.length ? data.errors.join(', ') : data?.message) ||
        'An API error occurred',
    );
    this.status = status;
    this.data = data;
  }
}

/** Human readable message for any error thrown by `api` (validation lists included). */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function authHeaders(): Record<string, string> {
  const { token, activeBranchId, user } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Only org-wide roles may switch branch; the API rejects the header for everyone else.
  if (activeBranchId && activeBranchId !== user?.branchId) headers['X-Branch-Id'] = activeBranchId;
  return headers;
}

/** Endpoints where a 401 means "bad credentials", not "expired access token". */
const NO_REFRESH = [
  '/auth/login',
  '/auth/refresh',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/change-password',
  '/staff-invitations/accept',
];

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the stored refresh token for a new access token (POST /auth/refresh
 * with { refreshToken, sessionId }). Concurrent 401s share one refresh call
 * because refresh tokens rotate and are single-use.
 */
function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const { refreshToken, sessionId } = useAuthStore.getState();
  if (!refreshToken || !sessionId) return Promise.resolve(false);
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, sessionId }),
      });
      if (!res.ok) return false;
      const body = await res.json();
      const data = body?.data ?? body;
      if (!data?.accessToken) return false;
      useAuthStore.getState().setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        sessionId: data.sessionId,
        user: data.user,
      });
      return true;
    } catch {
      return false;
    } finally {
      // Let the next expiry trigger a fresh refresh.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

function sessionExpired() {
  const state = useAuthStore.getState();
  if (state.isAuthenticated) {
    // The server session is already invalid; just clear local state.
    useAuthStore.setState({
      user: null,
      token: null,
      refreshToken: null,
      sessionId: null,
      isAuthenticated: false,
      activeBranchId: null,
    });
  }
  if (!window.location.pathname.startsWith('/auth/')) {
    window.location.href = '/auth/login';
  }
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}, raw = false, retried = false): Promise<any> {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...authHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && !NO_REFRESH.some((p) => endpoint.startsWith(p))) {
      const hadToken = !!useAuthStore.getState().token;
      if (hadToken && !retried && (await refreshAccessToken())) {
        return fetchWithAuth(endpoint, options, raw, true);
      }
      if (hadToken) sessionExpired();
    }

    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: response.statusText };
    }
    throw new ApiError(response.status, errorData);
  }

  if (raw) {
    return response;
  }

  // Handle empty responses
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  get: (endpoint: string, options?: RequestInit) => fetchWithAuth(endpoint, { ...options, method: 'GET' }),
  post: (endpoint: string, data?: any, options?: RequestInit) => fetchWithAuth(endpoint, { ...options, method: 'POST', body: JSON.stringify(data) }),
  patch: (endpoint: string, data?: any, options?: RequestInit) => fetchWithAuth(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(data) }),
  put: (endpoint: string, data?: any, options?: RequestInit) => fetchWithAuth(endpoint, { ...options, method: 'PUT', body: JSON.stringify(data) }),
  delete: (endpoint: string, options?: RequestInit) => fetchWithAuth(endpoint, { ...options, method: 'DELETE' }),
  /** multipart/form-data upload; the browser sets the boundary header. */
  upload: (endpoint: string, form: FormData, options?: RequestInit) => fetchWithAuth(endpoint, { ...options, method: 'POST', body: form }),
  /** Authenticated file download (CSV / PDF / document), saved via a temporary link. */
  download: async (endpoint: string, fallbackName = 'download') => {
    const res: Response = await fetchWithAuth(endpoint, { method: 'GET' }, true);
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = match ? decodeURIComponent(match[1]) : fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

/** Unwraps the `{ data, meta }` envelope used by every API response. */
export const unwrap = <T = any>(body: any): T => (body && typeof body === 'object' && 'data' in body ? body.data : body);
