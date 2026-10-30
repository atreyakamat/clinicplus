import { usePortalAuth } from './portal.store';

const PORTAL_BASE = '/api/v1/portal';

export class PortalApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super((Array.isArray(data?.errors) && data.errors.length ? data.errors.join(', ') : data?.message) || 'Something went wrong');
    this.status = status;
    this.data = data;
  }
}

export function portalErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof PortalApiError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Endpoints where a 401 is a credentials failure, not an expired access token. */
const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/otp/request', '/auth/otp/verify'];

let refreshInFlight: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const { refreshToken } = usePortalAuth.getState();
  if (!refreshToken) return Promise.resolve(false);
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${PORTAL_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const body = await res.json();
      const data = body?.data ?? body;
      if (!data?.accessToken) return false;
      usePortalAuth.getState().setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken, patient: data.patient });
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshInFlight = null), 0);
    }
  })();
  return refreshInFlight;
}

/** On a hard 401, drop the patient session and bounce back to the portal login. */
function sessionExpired() {
  usePortalAuth.getState().clear();
  if (!window.location.pathname.startsWith('/portal/login')) {
    window.location.href = '/portal/login';
  }
}

async function request(endpoint: string, options: RequestInit = {}, raw = false, retried = false): Promise<any> {
  const { token } = usePortalAuth.getState();
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${PORTAL_BASE}${endpoint}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401 && !NO_REFRESH.some((p) => endpoint.startsWith(p))) {
      const hadToken = !!usePortalAuth.getState().token;
      if (hadToken && !retried && (await refreshAccessToken())) {
        return request(endpoint, options, raw, true);
      }
      if (hadToken) sessionExpired();
    }
    let errorData: any;
    try {
      errorData = await res.json();
    } catch {
      errorData = { message: res.statusText };
    }
    throw new PortalApiError(res.status, errorData);
  }

  if (raw) return res;
  if (res.status === 204) return null;
  return res.json();
}

export const portalApi = {
  get: (endpoint: string) => request(endpoint, { method: 'GET' }),
  post: (endpoint: string, data?: any) => request(endpoint, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: (endpoint: string, data?: any) => request(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (endpoint: string, data?: any) => request(endpoint, { method: 'DELETE', body: data ? JSON.stringify(data) : undefined }),
  /** Authenticated binary download (PDF / document), saved via a temporary link. */
  download: async (endpoint: string, fallbackName = 'download') => {
    const res: Response = await request(endpoint, { method: 'GET' }, true);
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

/** Public (no token) auth calls. */
export const portalAuthApi = {
  login: (body: { clinicSlug: string; identifier: string; password: string }) => publicPost('/auth/login', body),
  requestOtp: (body: { clinicSlug: string; identifier: string }) => publicPost('/auth/otp/request', body),
  verifyOtp: (body: { clinicSlug: string; identifier: string; code: string }) => publicPost('/auth/otp/verify', body),
  logout: (refreshToken: string) => publicPost('/auth/logout', { refreshToken }).catch(() => undefined),
};

async function publicPost(endpoint: string, body: any) {
  const res = await fetch(`${PORTAL_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PortalApiError(res.status, data);
  return data?.data ?? data;
}

export const unwrap = <T = any>(body: any): T => (body && typeof body === 'object' && 'data' in body ? body.data : body);
