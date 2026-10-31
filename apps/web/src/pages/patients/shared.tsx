import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, ApiError } from '../../app/lib/api';
import { useAuthStore } from '../../app/store/auth.store';

/** API responses are wrapped as { data, meta }. */
export async function getData<T = any>(endpoint: string): Promise<T> {
  const res = await api.get(endpoint);
  return res?.data as T;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export async function getPage<T = any>(endpoint: string): Promise<{ items: T[]; meta: PageMeta }> {
  const res = await api.get(endpoint);
  return { items: (res?.data ?? []) as T[], meta: res?.meta as PageMeta };
}

export const unwrap = async <T = any,>(p: Promise<any>): Promise<T> => (await p)?.data as T;

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    const d = err.data || {};
    if (Array.isArray(d.errors) && d.errors.length) return d.errors.join('; ');
    return d.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export const isSafetyWarning = (err: unknown) => err instanceof ApiError && err.status === 409 && err.data?.error === 'SAFETY_WARNINGS';

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const fullName = (p?: { firstName?: string; lastName?: string } | null) => (p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '');
export const drName = (d?: { firstName?: string; lastName?: string } | null) => (d ? `Dr. ${fullName(d)}` : '—');

export const fmtDate = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString() : '—');
export const fmtDateTime = (v?: string | Date | null) =>
  v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function ageFrom(dob?: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

export const fmtSize = (bytes?: number | null) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Fetches an authenticated file as a blob (for previews). Caller must revoke the URL. */
export async function fetchBlobUrl(endpoint: string): Promise<{ url: string; type: string }> {
  const { token, activeBranchId, user } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (activeBranchId && activeBranchId !== user?.branchId) headers['X-Branch-Id'] = activeBranchId;
  const res = await fetch(`/api/v1${endpoint}`, { headers });
  if (!res.ok) {
    let data: any;
    try {
      data = await res.json();
    } catch {
      data = { message: res.statusText };
    }
    throw new ApiError(res.status, data);
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}

// ------------------------------------------------------------------ UI bits

export const inputCls =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#1FA971] focus:ring-2 focus:ring-[#1FA971]/15 disabled:bg-slate-50';
export const textareaCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1FA971] focus:ring-2 focus:ring-[#1FA971]/15 disabled:bg-slate-50';
export const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

export const Field = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={`flex flex-col gap-1 ${className}`}>
    <span className={labelCls}>{label}</span>
    {children}
  </label>
);

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
    <Loader2 className="animate-spin" size={16} /> {label}
  </div>
);

export const ErrorBox = ({ error, className = '' }: { error: unknown; className?: string }) =>
  error ? (
    <div className={`flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 ${className}`}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{typeof error === 'string' ? error : errorMessage(error)}</span>
    </div>
  ) : null;

export const Empty = ({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) => (
  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
    <p className="font-medium text-slate-700">{title}</p>
    {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    {children && <div className="mt-4">{children}</div>}
  </div>
);

export const Section = ({
  title,
  actions,
  children,
  className = '',
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {actions}
    </div>
    {children}
  </section>
);

export const Pager = ({ meta, onPage }: { meta?: PageMeta; onPage: (p: number) => void }) => {
  if (!meta || meta.pages <= 1) return meta ? <p className="text-xs text-slate-500">{meta.total} total</p> : null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
      <span>
        Page {meta.page} of {meta.pages} · {meta.total} total
      </span>
      <div className="flex gap-2">
        <button
          className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2 disabled:opacity-40"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2 disabled:opacity-40"
          disabled={meta.page >= meta.pages}
          onClick={() => onPage(meta.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export const StatusPill = ({ status }: { status?: string | null }) => {
  const s = (status || '').toUpperCase();
  const cls =
    s === 'ACTIVE' || s === 'COMPLETED'
      ? 'bg-emerald-100 text-emerald-700'
      : s === 'DRAFT'
        ? 'bg-amber-100 text-amber-700'
        : s === 'CANCELLED' || s === 'ARCHIVED'
          ? 'bg-red-100 text-red-700'
          : 'bg-slate-100 text-slate-700';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{s || '—'}</span>;
};

export interface PatientHit {
  id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
  phone?: string;
}

/** Search-as-you-type patient selector backed by /patients/search. */
export const PatientPicker = ({
  value,
  onChange,
  placeholder = 'Search patient by name, phone or ID…',
}: {
  value: PatientHit | null;
  onChange: (p: PatientHit | null) => void;
  placeholder?: string;
}) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [loading, setLoading] = useState(false);
  const term = useDebounced(q, 250);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (term.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    getData<PatientHit[]>(`/patients/search${qs({ q: term.trim() })}`)
      .then((r) => !cancelled && setHits(r ?? []))
      .catch(() => !cancelled && setHits([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [term]);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (value) {
    return (
      <div className="flex h-10 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm">
        <span>
          <span className="font-medium">{fullName(value)}</span>
          <span className="ml-2 text-slate-500">{value.patientCode}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-slate-400 hover:text-slate-700" aria-label="Clear patient">
          <X size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="relative" ref={ref}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <input
        className={`${inputCls} pl-9`}
        placeholder={placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && term.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <Loading label="Searching…" />
          ) : hits.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No patients found</p>
          ) : (
            hits.map((h) => (
              <button
                type="button"
                key={h.id}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onChange(h);
                  setQ('');
                  setOpen(false);
                }}
              >
                <span className="font-medium">{fullName(h)}</span>
                <span className="text-xs text-slate-500">
                  {h.patientCode} · {h.phone}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

/** Simple modal dialog. */
export const Modal = ({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
    <div className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white shadow-xl ${wide ? 'max-w-5xl' : 'max-w-lg'}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>
);
