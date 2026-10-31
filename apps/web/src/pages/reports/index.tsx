import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import { ErrorBox, errorMessage, formatDate, formatMoney, getData, inputCls, todayYmd, useBillingConfig, ymdDaysAgo } from '../billing/shared';

const TABS = [
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'ageing', label: 'AR ageing' },
  { id: 'daily-close', label: 'Daily close' },
  { id: 'revenue', label: 'Revenue' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const isOrgWide = (u: any) =>
  !!u?.orgWide || (u?.roles ?? []).some((r: string) => ['Organization Owner', 'Clinic Admin', 'Super Admin'].includes(r));

export const ReportsPage = () => {
  const can = useCan();
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const { currency } = useBillingConfig();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'outstanding') as Tab;
  const [scope, setScope] = useState<'branch' | 'org'>('branch');
  const [date, setDate] = useState(todayYmd());
  const [from, setFrom] = useState(ymdDaysAgo(29));
  const [to, setTo] = useState(todayYmd());
  const [groupBy, setGroupBy] = useState<'method' | 'doctor' | 'service'>('method');
  const [page, setPage] = useState(1);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const qs = new URLSearchParams({ scope });
  if (tab === 'daily-close') qs.set('date', date);
  if (tab === 'revenue') {
    qs.set('from', from);
    qs.set('to', to);
    qs.set('groupBy', groupBy);
  }
  if (tab === 'outstanding') {
    qs.set('page', String(page));
    qs.set('limit', '50');
  }

  const q = useQuery<any>({
    queryKey: ['reports', tab, qs.toString()],
    queryFn: () => getData(`/reports/${tab}?${qs.toString()}`),
    enabled: can('reports.view'),
  });

  if (!can('reports.view')) {
    return <div className="p-6"><ErrorBox message="You do not have permission to view financial reports." /></div>;
  }

  const exportCsv = async () => {
    setDownloadError(null);
    const exportQs = new URLSearchParams(qs);
    exportQs.delete('page');
    exportQs.delete('limit');
    try {
      await api.download(`/reports/${tab}/export?${exportQs.toString()}`, `${tab}.csv`);
    } catch (e) {
      setDownloadError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial reports"
        description="Receivables, ageing, daily cash-up and revenue breakdowns."
        actions={
          <HasPermission permission="reports.export">
            <Button variant="outline" className="gap-2" onClick={exportCsv}>
              <Download size={16} /> Export CSV
            </Button>
          </HasPermission>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setParams({ tab: t.id }, { replace: true }); setPage(1); }}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'daily-close' && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} w-auto`} aria-label="Date" />}
          {tab === 'revenue' && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-auto`} aria-label="From" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-auto`} aria-label="To" />
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} className={`${inputCls} w-auto`} aria-label="Group by">
                <option value="method">By payment method</option>
                <option value="doctor">By doctor</option>
                <option value="service">By service</option>
              </select>
            </>
          )}
          {isOrgWide(user) && (
            <select value={scope} onChange={(e) => setScope(e.target.value as any)} className={`${inputCls} w-auto`} aria-label="Scope">
              <option value="branch">This branch</option>
              <option value="org">All branches</option>
            </select>
          )}
        </div>
      </div>

      <ErrorBox message={downloadError} />
      {q.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
      ) : q.error ? (
        <ErrorBox message={errorMessage(q.error)} />
      ) : tab === 'outstanding' ? (
        <Outstanding data={q.data} currency={currency} page={page} setPage={setPage} />
      ) : tab === 'ageing' ? (
        <Ageing data={q.data} currency={currency} />
      ) : tab === 'daily-close' ? (
        <DailyClose data={q.data} currency={currency} />
      ) : (
        <Revenue data={q.data} currency={currency} />
      )}
    </div>
  );
};

const Table = ({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
    {!rows.length ? (
      <p className="p-10 text-center text-sm text-slate-500">{empty}</p>
    ) : (
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
          <tr>{head.map((h, i) => <th key={h} className={`px-4 py-3 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'text-left' : 'text-right'}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const Kpi = ({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'green' }) => (
  <Card className="p-4">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className={`mt-1 text-xl font-semibold ${tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</p>
  </Card>
);

const Outstanding = ({ data, currency, page, setPage }: { data: any; currency: string; page: number; setPage: (n: number) => void }) => (
  <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-3">
      <Kpi label="Total outstanding" value={formatMoney(data.summary.outstanding, currency)} tone="red" />
      <Kpi label="Patients with balance" value={String(data.summary.patients)} />
      <Kpi label="Open invoices" value={String(data.summary.invoices)} />
    </div>
    <Table
      head={['Patient', 'Phone', 'Invoices', 'Billed', 'Paid', 'Outstanding', 'Oldest due']}
      empty="No outstanding balances."
      rows={data.rows.map((r: any) => [
        <Link className="font-medium hover:underline" to={`/billing?patientId=${r.patientId}&outstanding=true`}>{r.patientName}</Link>,
        r.phone ?? '—',
        r.invoiceCount,
        formatMoney(r.billed, currency),
        formatMoney(r.paid, currency),
        <span className="font-semibold text-red-600">{formatMoney(r.outstanding, currency)}</span>,
        formatDate(r.oldestDue),
      ])}
    />
    {data.total > data.limit && (
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={page * data.limit >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    )}
  </div>
);

const Ageing = ({ data, currency }: { data: any; currency: string }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {data.buckets.map((b: any) => (
        <Kpi key={b.bucket} label={`${b.bucket} days (${b.invoices})`} value={formatMoney(b.amount, currency)} tone={b.bucket === '90+' && Number(b.amount) > 0 ? 'red' : undefined} />
      ))}
      <Kpi label="Total receivable" value={formatMoney(data.total, currency)} tone="red" />
    </div>
    <Table
      head={['Patient', '0-30', '31-60', '61-90', '90+', 'Total']}
      empty="Nothing receivable."
      rows={data.rows.map((r: any) => [
        r.patientName,
        formatMoney(r.d0_30, currency),
        formatMoney(r.d31_60, currency),
        formatMoney(r.d61_90, currency),
        formatMoney(r.d90_plus, currency),
        <span className="font-semibold">{formatMoney(r.total, currency)}</span>,
      ])}
    />
  </div>
);

const DailyClose = ({ data, currency }: { data: any; currency: string }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Kpi label="Collected" value={formatMoney(data.totalCollected, currency)} tone="green" />
      <Kpi label="Refunded" value={formatMoney(data.totalRefunded, currency)} />
      <Kpi label="Net" value={formatMoney(data.net, currency)} />
      <Kpi label={`Invoices raised (${data.invoices.raisedCount})`} value={formatMoney(data.invoices.raisedTotal, currency)} />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Collections by method</h3>
        <Table head={['Method', 'Payments', 'Amount']} empty="No collections on this day." rows={data.collections.map((c: any) => [c.method.replace('_', ' '), c.count, formatMoney(c.amount, currency)])} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Refunds by method</h3>
        <Table head={['Method', 'Refunds', 'Amount']} empty="No refunds on this day." rows={data.refunds.map((c: any) => [c.method.replace('_', ' '), c.count, formatMoney(c.amount, currency)])} />
      </div>
    </div>
    <p className="text-xs text-slate-500">
      {data.date} ({data.timezone}) · drafts created: {data.invoices.draftCount} · voided: {data.invoices.voidedCount} ({formatMoney(data.invoices.voidedTotal, currency)})
    </p>
  </div>
);

const Revenue = ({ data, currency }: { data: any; currency: string }) => {
  if (data.groupBy === 'method') {
    return (
      <Table
        head={['Method', 'Payments', 'Collected', 'Refunded', 'Net']}
        empty="No payments in this period."
        rows={data.rows.map((r: any) => [r.label.replace('_', ' '), r.count, formatMoney(r.collected, currency), formatMoney(r.refunded, currency), <span className="font-semibold">{formatMoney(r.net, currency)}</span>])}
      />
    );
  }
  if (data.groupBy === 'doctor') {
    return (
      <div className="space-y-2">
        <Table
          head={['Doctor', 'Invoices', 'Billed', 'Collected']}
          empty="No invoices in this period."
          rows={data.rows.map((r: any) => [r.label, r.count, formatMoney(r.billed, currency), formatMoney(r.collected, currency)])}
        />
        <p className="text-xs text-slate-500">Revenue is attributed to the doctor of the appointment linked to each invoice.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Table
        head={['Service / item', 'Qty', 'Invoices', 'Billed (gross)']}
        empty="No invoiced services in this period."
        rows={data.rows.map((r: any) => [r.fromCatalog ? r.label : `${r.label} (custom)`, r.quantity, r.count, formatMoney(r.billed, currency)])}
      />
      <p className="text-xs text-slate-500">Line amounts before invoice-level discounts and tax.</p>
    </div>
  );
};
