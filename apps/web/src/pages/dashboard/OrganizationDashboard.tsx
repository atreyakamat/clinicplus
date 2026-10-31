import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@clinicplus/ui';
import { useCan } from '../../app/components/HasPermission';
import { ErrorBox, errorMessage, formatMoney, getData, useBillingConfig } from '../billing/shared';
import { ChartCard, EmptyChart, Kpi, TrendArea, pctText } from '../analytics/charts';
import { AppointmentBoard, CollectionsCard } from './widgets';

/** Owner / admin business overview: every number is a SQL aggregate from /analytics. */
export const OrganizationDashboard = () => {
  const can = useCan();
  const { currency } = useBillingConfig();
  const money = (v: number) => formatMoney(v, currency);
  const overview = useQuery<any>({ queryKey: ['analytics', 'overview', 'dash'], queryFn: () => getData('/analytics/overview') });
  const today = useQuery<any>({ queryKey: ['analytics', 'today'], queryFn: () => getData('/analytics/today'), refetchInterval: 60_000 });
  const revenue = useQuery<any>({
    queryKey: ['analytics', 'revenue', 'dash'],
    queryFn: () => getData('/analytics/revenue'),
    enabled: can('analytics.financial'),
  });
  const o = overview.data;
  const t = today.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinic overview"
        description="Last 30 days, this branch."
        actions={<Link to="/analytics" className="text-sm font-medium text-[#1FA971]">Full analytics →</Link>}
      />
      {(overview.error || today.error) && <ErrorBox message={errorMessage(overview.error ?? today.error)} />}
      {overview.isLoading && <div className="h-24 animate-pulse rounded-xl bg-slate-100" />}
      {o && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Appointments today" value={String(o.today.total)} hint={`${o.today.completed} done · ${o.today.inClinic} in clinic`} />
          <Kpi label="Appointments (30d)" value={String(o.appointments.total)} hint={`No-show ${pctText(o.appointments.noShowRate)}`} />
          <Kpi label="Patients seen (30d)" value={String(o.patients.patientsSeen)} hint={`${o.patients.new} new · ${pctText(o.patients.returningRate)} returning`} />
          <Kpi label="Follow-up compliance" value={pctText(o.followUps.complianceRate)} hint={`Avg wait ${o.queue.avgWaitMinutes ?? '—'} min`} />
          {o.revenue && (
            <>
              <Kpi label="Net collected (30d)" value={money(Number(o.revenue.net))} />
              <Kpi label="Invoiced (30d)" value={money(Number(o.revenue.invoiced))} />
              <Kpi label="Outstanding" value={money(Number(o.revenue.outstanding))} hint={t?.invoices ? `${t.invoices.overdue} overdue` : undefined} />
              <Kpi label="Refunded (30d)" value={money(Number(o.revenue.refunded))} />
            </>
          )}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {can('analytics.financial') && (
            <ChartCard title="Revenue, last 30 days" subtitle="Net collected vs invoiced">
              {!revenue.data ? <EmptyChart message="Loading…" /> : (
                <TrendArea data={revenue.data.series} xKey="period" series={[{ key: 'net', label: 'Net collected' }, { key: 'invoiced', label: 'Invoiced' }]} format={money} />
              )}
            </ChartCard>
          )}
          <AppointmentBoard list={t?.appointments?.list} />
        </div>
        <div className="space-y-6">
          <CollectionsCard collections={t?.collections} currency={currency} />
          {t?.queue && (
            <div className="grid grid-cols-2 gap-4">
              <Kpi label="Waiting now" value={String(t.queue.waiting)} />
              <Kpi label="With doctor" value={String(t.queue.inProgress)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
