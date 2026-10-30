import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  organizationId: string;
  /** The user's home branch. */
  branchId: string;
  homeBranchId?: string;
  roles?: string[];
  permissions?: string[];
  /** Owner / Clinic Admin / Super Admin: may view and switch across branches. */
  orgWide?: boolean;
}

/** Shape returned by POST /auth/login, /auth/refresh and invitation acceptance (inside `data`). */
export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  sessionId?: string;
  user: User;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  /** Branch the UI works in; only org-wide roles may pick one other than their own. */
  activeBranchId: string | null;
  /** Backwards compatible: login(user, token) still works; pass the session for refresh support. */
  login: (user: User, token: string, session?: { refreshToken?: string; sessionId?: string }) => void;
  /** Stores a full session (login / invitation acceptance response). */
  setSession: (session: AuthSession) => void;
  /** Replaces tokens after a refresh, keeping the active branch. */
  setTokens: (tokens: { accessToken: string; refreshToken?: string; sessionId?: string; user?: User }) => void;
  updateUser: (patch: Partial<User>) => void;
  /** Ends the server session (best effort) and clears local state. */
  logout: () => void;
  setActiveBranch: (branchId: string | null) => void;
}

const API_BASE_URL = '/api/v1';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      sessionId: null,
      isAuthenticated: false,
      activeBranchId: null,
      login: (user, token, session) =>
        set({
          user,
          token,
          refreshToken: session?.refreshToken ?? null,
          sessionId: session?.sessionId ?? null,
          isAuthenticated: true,
          activeBranchId: null,
        }),
      setSession: (session) =>
        get().login(session.user, session.accessToken, { refreshToken: session.refreshToken, sessionId: session.sessionId }),
      setTokens: ({ accessToken, refreshToken, sessionId, user }) =>
        set((state) => ({
          token: accessToken,
          refreshToken: refreshToken ?? state.refreshToken,
          sessionId: sessionId ?? state.sessionId,
          user: user ?? state.user,
          isAuthenticated: true,
        })),
      updateUser: (patch) => set((state) => (state.user ? { user: { ...state.user, ...patch } } : {})),
      logout: () => {
        const { token, sessionId } = get();
        if (token && sessionId) {
          // Fire-and-forget: revoke the refresh token server-side so it cannot be reused.
          fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId }),
            keepalive: true,
          }).catch(() => undefined);
        }
        set({ user: null, token: null, refreshToken: null, sessionId: null, isAuthenticated: false, activeBranchId: null });
      },
      setActiveBranch: (branchId) => set({ activeBranchId: branchId }),
    }),
    {
      name: 'clinicos-auth',
    },
  ),
);
