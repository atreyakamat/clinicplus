import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@clinicplus/ui';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { ErrorBox, errorMessage, formatMoney, getData, useBillingConfig } from '../billing/shared';
import { ChartCard, EmptyChart, Kpi, TrendArea } from '../analytics/charts';
import { CollectionsCard } from './widgets';

export const AccountantDashboard = () => {
  const can = useCan();
  const { currency } = useBillingConfig();
  const money = (v: number) => formatMoney(v, currency);
  const today = useQuery<any>({ queryKey: ['analytics', 'today'], queryFn: () => getData('/analytics/today') });
  const revenue = useQuery<any>({ queryKey: ['analytics', 'revenue', 'dash'], queryFn: () => getData('/analytics/revenue') });
  const ageing = useQuery<any>({ queryKey: ['reports', 'ageing', 'dash'], queryFn: () => getData('/reports/ageing'), enabled: can('reports.view') });
  const totals = revenue.data?.totals;

  return (
    <div className="space-y-6">
      <PageHeader title="Finance overview" description="Last 30 days of collections and current receivables." />
      {(revenue.error || today.error) && <ErrorBox message={errorMessage(revenue.error ?? today.error)} />}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Net collected (30d)" value={totals ? money(Number(totals.net)) : '—'} hint={totals ? `${money(Number(totals.refunded))} refunded` : undefined} />
        <Kpi label="Invoiced (30d)" value={totals ? money(Number(totals.invoiced)) : '—'} />
        <Kpi label="Outstanding" value={totals ? money(Number(totals.outstanding)) : '—'} hint={today.data?.invoices ? `${today.data.invoices.overdue} overdue invoices` : undefined} />
        <Kpi label="Over 90 days" value={ageing.data ? money(Number(ageing.data.buckets[3].amount)) : '—'} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Collections per day" subtitle="Net of refunds">
            {!revenue.data ? <EmptyChart message="Loading…" /> : <TrendArea data={revenue.data.series} xKey="period" series={[{ key: 'net', label: 'Net collected' }]} format={money} />}
          </ChartCard>
        </div>
        <CollectionsCard collections={today.data?.collections} currency={currency} />
      </div>
      <HasPermission permission="reports.view">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="font-medium text-[#1FA971]" to="/reports?tab=daily-close">Daily close →</Link>
          <Link className="font-medium text-[#1FA971]" to="/reports?tab=outstanding">Outstanding by patient →</Link>
          <Link className="font-medium text-[#1FA971]" to="/billing?outstanding=true">Open invoices →</Link>
        </div>
      </HasPermission>
    </div>
  );
};
