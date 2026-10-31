/**
 * Small shared helpers for the continuity-of-care pages (tasks, follow-ups, reviews).
 */
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Search } from 'lucide-react';
import { api } from '../../app/lib/api';

export interface ListMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/** GET returning the unwrapped `data` of the API envelope. */
export async function getData<T = any>(endpoint: string): Promise<T> {
  const res = await api.get(endpoint);
  return (res?.data ?? res) as T;
}

/** GET for paginated lists: returns `{ items, meta }`. */
export async function getList<T = any>(endpoint: string): Promise<{ items: T[]; meta: ListMeta }> {
  const res = await api.get(endpoint);
  const items = Array.isArray(res?.data) ? res.data : [];
  const meta = res?.meta ?? {};
  return {
    items,
    meta: {
      total: meta.total ?? items.length,
      page: meta.page ?? 1,
      limit: meta.limit ?? items.length,
      pages: meta.pages ?? 1,
    },
  };
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as any;
  const msg = e?.data?.message ?? e?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return typeof msg === 'string' && msg ? msg : fallback;
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const fmtDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (d?: string | Date | null) =>
  d
    ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

export const personName = (p?: { firstName?: string | null; lastName?: string | null } | null) =>
  p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—' : '—';

/** yyyy-mm-dd for <input type="date"> in local time. */
export const toDateInput = (d: Date | string) => {
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** Local date input -> ISO at 09:00 local time. */
export const dateInputToIso = (v: string, hour = 9) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
};

export const inputCls =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]';

export const ErrorBox = ({ error }: { error: unknown }) =>
  error ? (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {errorMessage(error)}
    </div>
  ) : null;

export const Modal = ({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Drawer = ({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={title}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="truncate text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
};

export interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  patientCode?: string | null;
}

/** Debounced patient search (GET /patients/search). */
export const PatientPicker = ({
  value,
  onChange,
  label = 'Patient',
}: {
  value: PatientOption | null;
  onChange: (p: PatientOption | null) => void;
  label?: string;
}) => {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  const { data, isFetching, error } = useQuery({
    queryKey: ['patient-search', debounced],
    queryFn: () => getData<PatientOption[]>(`/patients/search${qs({ q: debounced })}`),
    enabled: debounced.length >= 2 && !value,
  });

  if (value) {
    return (
      <div className="space-y-1">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <span>
            <span className="font-medium text-slate-900">{personName(value)}</span>
            {value.phone && <span className="ml-2 text-slate-500">{value.phone}</span>}
          </span>
          <button type="button" className="text-xs text-[#2563EB] hover:underline" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700" htmlFor="patient-search">
        {label}
      </label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input
          id="patient-search"
          className={`${inputCls} pl-9`}
          placeholder="Search name, phone or code"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoComplete="off"
        />
      </div>
      {error ? <ErrorBox error={error} /> : null}
      {debounced.length >= 2 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
          {isFetching && <li className="px-3 py-2 text-sm text-slate-500">Searching…</li>}
          {!isFetching && !data?.length && <li className="px-3 py-2 text-sm text-slate-500">No patients found</li>}
          {data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => onChange(p)}
              >
                <span className="font-medium text-slate-900">{personName(p)}</span>
                <span className="text-slate-500">{p.phone ?? p.patientCode ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Pager = ({ meta, page, onPage }: { meta?: ListMeta; page: number; onPage: (p: number) => void }) =>
  meta && meta.pages > 1 ? (
    <div className="flex items-center justify-between px-1 py-3 text-sm text-slate-500">
      <span>
        Page {meta.page} of {meta.pages} · {meta.total} total
      </span>
      <div className="flex gap-2">
        <button
          className="rounded-lg border px-3 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          className="rounded-lg border px-3 py-1 disabled:opacity-40"
          disabled={page >= meta.pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  ) : null;
