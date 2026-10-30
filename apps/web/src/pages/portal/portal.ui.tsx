import { Loader2, AlertCircle, Inbox } from 'lucide-react';
import { portalErrorMessage } from './portal.api';

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>;
}

/** One place for the loading / error / empty states required on every list. */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyText = 'Nothing here yet.',
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center text-slate-500">
        <AlertCircle className="w-7 h-7 text-red-400 mb-2" />
        <p className="text-sm">{portalErrorMessage(error)}</p>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center text-slate-400">
        <Inbox className="w-7 h-7 mb-2" />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function StatusPill({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  const tone =
    /PAID|CONFIRMED|ACTIVE|COMPLETED/.test(s)
      ? 'bg-emerald-50 text-emerald-700'
      : /CANCELLED|VOID|NO_SHOW|FAILED/.test(s)
      ? 'bg-slate-100 text-slate-500'
      : /OVERDUE|PARTIAL/.test(s)
      ? 'bg-amber-50 text-amber-700'
      : 'bg-sky-50 text-sky-700';
  return <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${tone}`}>{s.replace(/_/g, ' ')}</span>;
}

export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtMoney = (v: string | number, currency = 'INR') => `${currency} ${Number(v ?? 0).toFixed(2)}`;
