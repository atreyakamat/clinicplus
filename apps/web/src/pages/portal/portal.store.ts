import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Patient as returned by the portal auth + /portal/me endpoints. */
export interface PortalPatient {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  preferredChannel?: string | null;
  organizationId: string;
  organization?: { id: string; name: string; slug: string; primaryColor?: string | null; logoUrl?: string | null };
}

export interface PortalSession {
  accessToken: string;
  refreshToken: string;
  patient: PortalPatient;
}

interface PortalAuthState {
  patient: PortalPatient | null;
  token: string | null;
  refreshToken: string | null;
  /** The clinic the patient signed in to; kept so the login screen can prefill it. */
  clinicSlug: string | null;
  isAuthenticated: boolean;
  setSession: (session: PortalSession, clinicSlug?: string) => void;
  setTokens: (tokens: { accessToken: string; refreshToken?: string; patient?: PortalPatient }) => void;
  setClinicSlug: (slug: string) => void;
  clear: () => void;
}

/**
 * Patient portal auth store — deliberately SEPARATE from the staff auth store
 * (its own localStorage key, its own token). A staff session and a patient
 * session never share state or tokens.
 */
export const usePortalAuth = create<PortalAuthState>()(
  persist(
    (set) => ({
      patient: null,
      token: null,
      refreshToken: null,
      clinicSlug: null,
      isAuthenticated: false,
      setSession: (session, clinicSlug) =>
        set((state) => ({
          patient: session.patient,
          token: session.accessToken,
          refreshToken: session.refreshToken,
          clinicSlug: clinicSlug ?? state.clinicSlug,
          isAuthenticated: true,
        })),
      setTokens: ({ accessToken, refreshToken, patient }) =>
        set((state) => ({
          token: accessToken,
          refreshToken: refreshToken ?? state.refreshToken,
          patient: patient ?? state.patient,
          isAuthenticated: true,
        })),
      setClinicSlug: (slug) => set({ clinicSlug: slug }),
      clear: () => set({ patient: null, token: null, refreshToken: null, isAuthenticated: false }),
    }),
    { name: 'clinicplus-portal-auth' },
  ),
);
