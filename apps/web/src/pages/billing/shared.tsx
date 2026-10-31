import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';

/** Unwraps the API's `{ data, meta }` envelope. */
export async function getData<T = any>(endpoint: string): Promise<T> {
  const res = await api.get(endpoint);
  return res?.data as T;
}

export async function getPage<T = any>(endpoint: string): Promise<{ items: T[]; total: number; page: number; pages: number }> {
  const res = await api.get(endpoint);
  return {
    items: (res?.data ?? []) as T[],
    total: res?.meta?.total ?? 0,
    page: res?.meta?.page ?? 1,
    pages: res?.meta?.pages ?? 1,
  };
}

export const errorMessage = (err: any): string => {
  const msg = err?.data?.message ?? err?.message ?? 'Something went wrong';
  return Array.isArray(msg) ? msg.join(', ') : String(msg);
};

export interface BillingConfig {
  currency: string;
  onlinePayments: boolean;
}

/** Currency + whether Stripe is configured. Falls back to INR when the caller can't read invoices. */
export const useBillingConfig = (): BillingConfig => {
  const can = useCan();
  const { data } = useQuery<BillingConfig>({
    queryKey: ['billing-config'],
    queryFn: () => getData('/invoices/config'),
    enabled: can('invoices.view'),
    staleTime: 10 * 60_000,
  });
  return data ?? { currency: 'INR', onlinePayments: false };
};

export const formatMoney = (value: unknown, currency = 'INR') => {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
};

export const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : '—');
export const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  SENT: 'bg-blue-50 text-blue-700 border-blue-200',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OVERDUE: 'bg-red-50 text-red-700 border-red-200',
  VOID: 'bg-slate-200 text-slate-500 border-slate-300 line-through',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  REFUNDED: 'bg-slate-100 text-slate-600 border-slate-200',
  PARTIALLY_REFUNDED: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT}`}>
    {status.replace(/_/g, ' ')}
  </span>
);

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
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
    <div className={`max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

export const ErrorBox = ({ message }: { message?: string | null }) =>
  message ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div> : null;

export const inputCls =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]';

export const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block space-y-1">
    <span className="text-xs font-medium text-slate-600">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-400">{hint}</span>}
  </label>
);

export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const ymdDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
