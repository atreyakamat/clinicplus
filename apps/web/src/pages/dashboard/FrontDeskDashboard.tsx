import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@clinicplus/ui';
import { useAuthStore } from '../../app/store/auth.store';
import { ErrorBox, errorMessage, formatMoney, getData, useBillingConfig } from '../billing/shared';
import { Kpi } from '../analytics/charts';
import { AppointmentBoard, CollectionsCard } from './widgets';

export const FrontDeskDashboard = () => {
  const user = useAuthStore((s) => s.user);
  const { currency } = useBillingConfig();
  const q = useQuery<any>({ queryKey: ['analytics', 'today'], queryFn: () => getData('/analytics/today'), refetchInterval: 60_000 });
  const t = q.data;

  return (
    <div className="space-y-6">
      <PageHeader title={`Good day${user?.firstName ? `, ${user.firstName}` : ''}`} description="Today at the clinic." />
      {q.isLoading && <div className="h-24 animate-pulse rounded-xl bg-slate-100" />}
      {q.error && <ErrorBox message={errorMessage(q.error)} />}
      {t && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {t.appointments && <Kpi label="Appointments today" value={String(t.appointments.total)} hint={`${t.appointments.completed} done · ${t.appointments.upcoming} to come`} />}
            {t.queue && <Kpi label="Waiting now" value={String(t.queue.waiting)} hint={`${t.queue.inProgress} with doctor`} />}
            {t.queue && <Kpi label="Avg wait today" value={t.queue.avgWaitMinutes === null ? '—' : `${t.queue.avgWaitMinutes} min`} />}
            {t.invoices && <Kpi label="Outstanding" value={formatMoney(t.invoices.outstanding, currency)} hint={`${t.invoices.open} open · ${t.invoices.overdue} overdue`} />}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2"><AppointmentBoard list={t.appointments?.list} /></div>
            <CollectionsCard collections={t.collections} currency={currency} />
          </div>
        </>
      )}
    </div>
  );
};
