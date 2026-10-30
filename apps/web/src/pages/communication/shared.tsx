import React from 'react';
import { api } from '../../app/lib/api';

/** API responses are wrapped as { data, meta }. */
export async function getData<T = any>(endpoint: string): Promise<T> {
  const res = await api.get(endpoint);
  return res?.data as T;
}

export async function getPage<T = any>(endpoint: string): Promise<{ items: T[]; total: number; page: number; pages: number }> {
  const res = await api.get(endpoint);
  return { items: res?.data ?? [], total: res?.meta?.total ?? 0, page: res?.meta?.page ?? 1, pages: res?.meta?.pages ?? 1 };
}

export const errMsg = (e: unknown) => {
  const anyE = e as any;
  const m = anyE?.data?.message ?? anyE?.message;
  return Array.isArray(m) ? m.join(', ') : String(m ?? 'Something went wrong');
};

export const TEMPLATE_VARIABLES = ['patientName', 'firstName', 'doctorName', 'clinicName', 'appointmentDate', 'appointmentTime', 'branchName', 'link'];

export const SAMPLE_VARS: Record<string, string> = {
  patientName: 'Asha Patel',
  firstName: 'Asha',
  doctorName: 'Dr. Mehta',
  clinicName: 'Your Clinic',
  appointmentDate: '12 Nov 2026',
  appointmentTime: '10:30 am',
  branchName: 'Main Branch',
  link: 'https://example.com/r/abc123',
};

export function renderLocal(content: string, vars: Record<string, string> = SAMPLE_VARS) {
  return content
    .replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_m, n) => vars[n] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export const patientName = (p?: { firstName?: string; lastName?: string } | null) =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : 'Unknown patient';

const STATUS_STYLES: Record<string, string> = {
  DELIVERED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  READ: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  SENT: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  QUEUED: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  PENDING: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  NOT_SENT_CONSOLE: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  FAILED: 'bg-red-500/15 text-red-300 border-red-500/30',
  UNDELIVERED: 'bg-red-500/15 text-red-300 border-red-500/30',
  RECEIVED: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  DRAFT: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  SCHEDULED: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  SENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  CANCELLED: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = { NOT_SENT_CONSOLE: 'Not sent (console)' };

export const StatusBadge = ({ status }: { status?: string | null }) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status ?? ''] ?? STATUS_STYLES.PENDING}`}>
    {STATUS_LABELS[status ?? ''] ?? (status || 'UNKNOWN').replace(/_/g, ' ')}
  </span>
);

export const Panel = ({ className = '', children }: { className?: string; children: React.ReactNode }) => (
  <div className={`rounded-xl border border-gray-800 bg-[#1F2937] p-4 ${className}`}>{children}</div>
);

export const Btn = ({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) => {
  const styles = {
    primary: 'bg-[#1FA971] hover:bg-[#1a9663] text-white',
    ghost: 'border border-gray-700 text-gray-200 hover:bg-gray-800',
    danger: 'border border-red-500/40 text-red-300 hover:bg-red-500/10',
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
};

export const inputCls =
  'w-full rounded-lg border border-gray-700 bg-[#0B0F14] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-[#1FA971] focus:outline-none';

export const ErrorNote = ({ error }: { error: unknown }) =>
  error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{errMsg(error)}</p> : null;

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center text-sm text-gray-400">{children}</div>
);

export const Loading = ({ label = 'Loading…' }: { label?: string }) => <div className="p-6 text-sm text-gray-400">{label}</div>;

export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
