import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@clinicplus/ui';
import { useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import { ErrorBox, errorMessage, formatMoney, getData, inputCls, todayYmd, useBillingConfig, ymdDaysAgo } from '../billing/shared';
import { Bars, ChartCard, EmptyChart, Kpi, TrendArea, pctText } from './charts';

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '12 months', days: 365 },
];

const isOrgWide = (u: any) =>
  !!u?.orgWide || (u?.roles ?? []).some((r: string) => ['Organization Owner', 'Clinic Admin', 'Super Admin'].includes(r));

export const AnalyticsPage = () => {
  const can = useCan();
  const user = useAuthStore((s) => s.user);
  const { currency } = useBillingConfig();
  const [from, setFrom] = useState(ymdDaysAgo(29));
  const [to, setTo] = useState(todayYmd());
  const [scope, setScope] = useState<'branch' | 'org'>('branch');
  const [doctorId, setDoctorId] = useState('');
  const qs = `from=${from}&to=${to}&scope=${scope}`;
  const money = (v: number) => formatMoney(v, currency);

  const viewer = can('analytics.view');
  const financial = can('analytics.financial');
  const doctorOnly = !viewer && can('analytics.doctor');

  const overview = useQuery<any>({ queryKey: ['analytics', 'overview', qs], queryFn: () => getData(`/analytics/overview?${qs}`), enabled: viewer });
  const revenue = useQuery<any>({ queryKey: ['analytics', 'revenue', qs], queryFn: () => getData(`/analytics/revenue?${qs}`), enabled: financial });
  const retention = useQuery<any>({ queryKey: ['analytics', 'retention', qs], queryFn: () => getData(`/analytics/retention?${qs}`), enabled: viewer });
  const branches = useQuery<any>({
    queryKey: ['analytics', 'branches', qs],
    queryFn: () => getData(`/analytics/branches?from=${from}&to=${to}`),
    enabled: viewer && isOrgWide(user),
  });
  const doctors = useQuery<any[]>({
    queryKey: ['analytics', 'doctor-list'],
    queryFn: async () => {
      const list = await getData<any>('/doctors?limit=100');
      return Array.isArray(list) ? list : list?.items ?? [];
    },
    enabled: viewer,
    retry: false,
  });
  const doctor = useQuery<any>({
    queryKey: ['analytics', 'doctor', doctorOnly ? 'me' : doctorId, qs],
    queryFn: () => getData(doctorOnly ? `/analytics/doctor/me?${qs}` : `/analytics/doctors/${doctorId}?${qs}`),
    enabled: doctorOnly || (viewer && !!doctorId),
  });

  if (!viewer && !financial && !doctorOnly) {
    return <div className="p-6"><ErrorBox message="You do not have access to analytics." /></div>;
  }

  const o = overview.data;
  const rangeError = overview.error ?? revenue.error ?? doctor.error;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Clinic performance over the selected period." />

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => { setFrom(ymdDaysAgo(p.days - 1)); setTo(todayYmd()); }}
            className={`rounded-lg border px-3 py-1.5 text-sm ${from === ymdDaysAgo(p.days - 1) && to === todayYmd() ? 'border-[#1FA971] bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {p.label}
          </button>
        ))}
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-auto`} aria-label="From" />
        <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-auto`} aria-label="To" />
        {isOrgWide(user) && (
          <select value={scope} onChange={(e) => setScope(e.target.value as any)} className={`${inputCls} w-auto`} aria-label="Scope">
            <option value="branch">This branch</option>
            <option value="org">All branches</option>
          </select>
        )}
      </div>

      {rangeError && <ErrorBox message={errorMessage(rangeError)} />}

      {viewer && o && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Appointments" value={String(o.appointments.total)} hint={`${o.appointments.completed} completed · ${o.today.total} today`} />
          <Kpi label="No-show rate" value={pctText(o.appointments.noShowRate)} hint={`${o.appointments.noShow} no-shows`} />
          <Kpi label="Patients seen" value={String(o.patients.patientsSeen)} hint={`${o.patients.new} new · ${o.patients.returning} returning · ${o.patients.registered} registered`} />
          <Kpi label="Avg queue wait" value={o.queue.avgWaitMinutes === null ? '—' : `${o.queue.avgWaitMinutes} min`} hint={`${o.queue.patientsCalled} patients called`} />
          <Kpi label="Follow-up compliance" value={pctText(o.followUps.complianceRate)} hint={`${o.followUps.completed} of ${o.followUps.due} due`} />
          {o.revenue && (
            <>
              <Kpi label="Collected (net)" value={money(Number(o.revenue.net))} hint={`${money(Number(o.revenue.refunded))} refunded`} />
              <Kpi label="Invoiced" value={money(Number(o.revenue.invoiced))} />
              <Kpi label="Outstanding now" value={money(Number(o.revenue.outstanding))} />
            </>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {financial && (
          <ChartCard title="Revenue" subtitle={revenue.data ? `Per ${revenue.data.interval} · net of refunds` : undefined}>
            {revenue.isLoading ? <EmptyChart message="Loading…" /> : !revenue.data?.series?.length ? <EmptyChart /> : (
              <TrendArea data={revenue.data.series} xKey="period" series={[{ key: 'net', label: 'Net collected' }, { key: 'invoiced', label: 'Invoiced' }]} format={money} />
            )}
          </ChartCard>
        )}
        {viewer && (
          <ChartCard
            title="Returning patients by month"
            subtitle={retention.data ? `Repeat-visit rate ${pctText(retention.data.repeatRate)} · ${retention.data.avgVisitsPerPatient} visits per patient` : undefined}
          >
            {retention.isLoading ? <EmptyChart message="Loading…" /> : !retention.data?.monthly?.length ? <EmptyChart message="No completed visits in this period." /> : (
              <Bars data={retention.data.monthly} xKey="month" stacked dateAxis={false} series={[{ key: 'returning', label: 'Returning' }, { key: 'new', label: 'New' }]} />
            )}
          </ChartCard>
        )}
      </div>

      {(viewer || doctorOnly) && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{doctorOnly ? 'My practice' : 'Doctor performance'}</h2>
            {viewer && (
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={`${inputCls} w-auto`} aria-label="Doctor">
                <option value="">Select a doctor…</option>
                {(doctors.data ?? []).map((d: any) => (
                  <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>
                ))}
              </select>
            )}
          </div>
          {doctor.data ? (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Kpi label="Appointments" value={String(doctor.data.appointments.total)} hint={`${doctor.data.appointments.completed} completed`} />
                <Kpi label="No-show rate" value={pctText(doctor.data.appointments.noShowRate)} />
                <Kpi label="Patients" value={String(doctor.data.patients.patientsSeen)} hint={`${doctor.data.patients.new} new · ${doctor.data.patients.returning} returning`} />
                <Kpi label="Consultations completed" value={String(doctor.data.consultationsCompleted)} />
                <Kpi label="Follow-up compliance" value={pctText(doctor.data.followUps.complianceRate)} />
                <Kpi label="Avg queue wait" value={doctor.data.queue.avgWaitMinutes === null ? '—' : `${doctor.data.queue.avgWaitMinutes} min`} />
                {doctor.data.revenue && (
                  <>
                    <Kpi label="Billed" value={money(Number(doctor.data.revenue.billed))} hint={`${doctor.data.revenue.invoices} invoices`} />
                    <Kpi label="Collected" value={money(Number(doctor.data.revenue.collected))} />
                  </>
                )}
              </div>
              <ChartCard title="Appointments per day">
                <Bars data={doctor.data.daily} xKey="date" series={[{ key: 'completed', label: 'Completed' }, { key: 'noShow', label: 'No-show' }]} stacked />
              </ChartCard>
            </>
          ) : doctor.isLoading && (doctorOnly || doctorId) ? (
            <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
          ) : viewer && !doctorId ? (
            <p className="text-sm text-slate-500">{doctors.isError ? 'Doctor list unavailable.' : 'Pick a doctor to see their numbers.'}</p>
          ) : null}
        </section>
      )}

      {branches.data?.branches?.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Branch comparison</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Branch</th>
                  <th className="px-4 py-3 text-right font-medium">Appointments</th>
                  <th className="px-4 py-3 text-right font-medium">No-show</th>
                  <th className="px-4 py-3 text-right font-medium">New patients</th>
                  {financial && <th className="px-4 py-3 text-right font-medium">Net collected</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branches.data.branches.map((b: any) => (
                  <tr key={b.branchId}>
                    <td className="px-4 py-2.5">{b.name}</td>
                    <td className="px-4 py-2.5 text-right">{b.appointments}</td>
                    <td className="px-4 py-2.5 text-right">{pctText(b.noShowRate)}</td>
                    <td className="px-4 py-2.5 text-right">{b.newPatients}</td>
                    {financial && <td className="px-4 py-2.5 text-right">{money(Number(b.net))}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
