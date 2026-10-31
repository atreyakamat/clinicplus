import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@clinicplus/ui';
import { useAuthStore } from '../../app/store/auth.store';
import { ErrorBox, errorMessage, formatMoney, getData, useBillingConfig } from '../billing/shared';
import { Bars, ChartCard, Kpi, pctText } from '../analytics/charts';
import { AppointmentBoard } from './widgets';

/** The doctor's own day and last-30-day practice numbers (GET /analytics/doctor/me). */
export const DoctorDashboard = () => {
  const user = useAuthStore((s) => s.user);
  const { currency } = useBillingConfig();
  const q = useQuery<any>({ queryKey: ['analytics', 'doctor', 'me', 'dash'], queryFn: () => getData('/analytics/doctor/me'), refetchInterval: 60_000 });
  const d = q.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Dr. ${user?.lastName ?? user?.firstName ?? ''}`.trim()}
        description="Your day and your practice over the last 30 days."
        actions={<Link to="/analytics" className="text-sm font-medium text-[#1FA971]">Full analytics →</Link>}
      />
      {q.isLoading && <div className="h-24 animate-pulse rounded-xl bg-slate-100" />}
      {q.error && <ErrorBox message={errorMessage(q.error)} />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Today" value={String(d.today.total)} hint={`${d.today.completed} seen · ${d.today.upcoming + d.today.inClinic} remaining`} />
            <Kpi label="Patients (30d)" value={String(d.patients.patientsSeen)} hint={`${d.patients.new} new · ${d.patients.returning} returning`} />
            <Kpi label="No-show rate" value={pctText(d.appointments.noShowRate)} hint={`${d.appointments.noShow} of ${d.appointments.completed + d.appointments.noShow}`} />
            <Kpi label="Follow-up compliance" value={pctText(d.followUps.complianceRate)} hint={`${d.followUps.completed} of ${d.followUps.due} due`} />
            {d.revenue && <Kpi label="Billed (30d)" value={formatMoney(d.revenue.billed, currency)} hint={`${formatMoney(d.revenue.collected, currency)} collected`} />}
            <Kpi label="Consultations (30d)" value={String(d.consultationsCompleted)} />
            <Kpi label="Avg queue wait" value={d.queue.avgWaitMinutes === null ? '—' : `${d.queue.avgWaitMinutes} min`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <AppointmentBoard list={d.today.appointments} showDoctor={false} title="My appointments today" />
            <div className="lg:col-span-2">
              <ChartCard title="Appointments per day">
                <Bars data={d.daily} xKey="date" stacked series={[{ key: 'completed', label: 'Completed' }, { key: 'noShow', label: 'No-show' }]} />
              </ChartCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
