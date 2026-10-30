import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, ChevronRight, CreditCard, FileText, Plus, Search } from 'lucide-react';
import { Button, PageHeader } from '@clinicplus/ui';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { ErrorBox, StatusBadge, errorMessage, formatDate, formatMoney, getData, getPage, inputCls, useBillingConfig } from './shared';

const STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'OVERDUE', 'PAID', 'VOID'];
const PAGE_SIZE = 25;

export const BillingPage = () => {
  const [params, setParams] = useSearchParams();
  const { currency } = useBillingConfig();
  const can = useCan();
  const [search, setSearch] = useState(params.get('search') ?? '');

  const status = params.get('status') ?? '';
  const outstanding = params.get('outstanding') === 'true';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const patientId = params.get('patientId') ?? '';

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // debounce search into the URL
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('search') ?? '') !== search) update({ search });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (status) qs.set('status', status);
  if (outstanding) qs.set('outstanding', 'true');
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (patientId) qs.set('patientId', patientId);
  if (params.get('search')) qs.set('search', params.get('search')!);

  const list = useQuery({
    queryKey: ['invoices', qs.toString()],
    queryFn: () => getPage<any>(`/invoices?${qs.toString()}`),
    placeholderData: (prev) => prev,
  });

  const summary = useQuery<any>({
    queryKey: ['analytics', 'today', 'billing'],
    queryFn: () => getData('/analytics/today'),
    enabled: can('dashboard.view'),
  });

  const s = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Invoices"
        description="Invoices, collections and outstanding balances for this branch."
        actions={
          <HasPermission permission="invoices.create">
            <Link to="/billing/new">
              <Button className="gap-2">
                <Plus size={16} /> New invoice
              </Button>
            </Link>
          </HasPermission>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard icon={<AlertCircle size={22} />} tone="red" label="Outstanding" value={s?.invoices ? formatMoney(s.invoices.outstanding, currency) : '—'} hint={s?.invoices ? `${s.invoices.open} open · ${s.invoices.overdue} overdue` : undefined} />
        <SummaryCard icon={<CreditCard size={22} />} tone="green" label="Collected today" value={s?.collections ? formatMoney(s.collections.total, currency) : '—'} hint={s?.collections?.byMethod?.map((m: any) => `${m.method} ${formatMoney(m.amount, currency)}`).join(' · ') || undefined} />
        <SummaryCard icon={<FileText size={22} />} tone="blue" label="Invoices in view" value={String(list.data?.total ?? '—')} hint={outstanding ? 'Outstanding only' : status ? status.replace(/_/g, ' ') : 'All statuses'} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice #, patient name or phone" className={`${inputCls} pl-9`} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:flex">
            <select value={status} onChange={(e) => update({ status: e.target.value })} className={inputCls} aria-label="Status">
              <option value="">All statuses</option>
              {STATUSES.map((st) => (
                <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <input type="date" value={from} onChange={(e) => update({ from: e.target.value })} className={inputCls} aria-label="From date" />
            <input type="date" value={to} onChange={(e) => update({ to: e.target.value })} className={inputCls} aria-label="To date" />
            <label className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 px-3 text-sm text-slate-700">
              <input type="checkbox" checked={outstanding} onChange={(e) => update({ outstanding: e.target.checked ? 'true' : '' })} />
              Outstanding only
            </label>
          </div>
        </div>
        {patientId && (
          <div className="flex items-center justify-between bg-slate-50 px-4 py-2 text-xs text-slate-600">
            Filtered to one patient
            <button className="font-medium text-[#1FA971]" onClick={() => update({ patientId: '' })}>Clear</button>
          </div>
        )}

        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : list.error ? (
          <div className="p-4"><ErrorBox message={errorMessage(list.error)} /></div>
        ) : !list.data?.items.length ? (
          <div className="p-12 text-center text-sm text-slate-500">No invoices match these filters.</div>
        ) : (
          <>
            {/* mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {list.data.items.map((inv) => (
                <li key={inv.id}>
                  <Link to={`/billing/${inv.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{inv.invoiceNumber}</div>
                      <div className="truncate text-sm text-slate-500">{inv.patient?.firstName} {inv.patient?.lastName} · {formatDate(inv.createdAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatMoney(inv.total, currency)}</div>
                      <StatusBadge status={inv.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Invoice #</th>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Due</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.items.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3">{inv.patient?.firstName} {inv.patient?.lastName}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(inv.createdAt)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatMoney(inv.total, currency)}</td>
                      <td className={`px-4 py-3 text-right ${Number(inv.balance) > 0 && inv.status !== 'VOID' ? 'text-red-600' : 'text-slate-500'}`}>{formatMoney(inv.balance, currency)}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/billing/${inv.id}`}>
                          <Button variant="outline" size="sm" className="gap-1">View <ChevronRight size={14} /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
              <span>Page {list.data.page} of {Math.max(1, list.data.pages)} · {list.data.total} invoices</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft size={16} /></Button>
                <Button variant="outline" size="sm" disabled={page >= (list.data.pages || 1)} onClick={() => update({ page: String(page + 1) })} aria-label="Next page"><ChevronRight size={16} /></Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const TONES: Record<string, string> = {
  red: 'bg-red-50 text-red-600',
  green: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
};

const SummaryCard = ({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone: string }) => (
  <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className={`rounded-xl p-3 ${TONES[tone]}`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {hint && <p className="truncate text-xs text-slate-400">{hint}</p>}
    </div>
  </div>
);
