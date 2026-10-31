import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Download, Trash2, Phone } from 'lucide-react';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { type Appointment, type Doctor, STATUS_STYLES, addDaysYmd, errorMessage, fmtDay, fmtTime, inputCls, statusLabel, unwrap, unwrapPage, weekdayOf, ymd } from '../doctors/scheduling';

const VIEWS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'list', label: 'List' },
  { id: 'waitlist', label: 'Waitlist' },
] as const;
type View = (typeof VIEWS)[number]['id'];

const STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

export const AppointmentsPage = () => {
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find((v) => v.id === params.get('view'))?.id ?? 'day') as View;
  const date = params.get('date') ?? ymd();
  const doctorId = params.get('doctorId') ?? '';
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next);
  };

  const { data: doctors } = useQuery<Doctor[]>({
    queryKey: ['doctors', ''],
    queryFn: async () => unwrap<Doctor[]>(await api.get('/doctors')),
  });

  const step = view === 'week' ? 7 : 1;
  const weekStart = addDaysYmd(date, -((weekdayOf(date) + 6) % 7)); // Monday

  return (
    <div className="space-y-5">
      <PageHeader
        title="Appointments"
        description="Daily and weekly schedules, bookings and the waitlist."
        actions={
          <div className="flex gap-2">
            <HasPermission permission="appointments.export">
              <Button variant="outline" className="gap-2" onClick={() => api.download(`/appointments/export/csv?${view === 'week' ? `from=${weekStart}&to=${addDaysYmd(weekStart, 6)}` : `date=${date}`}${doctorId ? `&doctorId=${doctorId}` : ''}`, 'appointments.csv').catch((e) => alert(errorMessage(e)))}>
                <Download size={16} /> CSV
              </Button>
            </HasPermission>
            <HasPermission permission="appointments.create">
              <Link to={`/appointments/new?date=${date}${doctorId ? `&doctorId=${doctorId}` : ''}`}><Button className="gap-2"><Plus size={16} /> New appointment</Button></Link>
            </HasPermission>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex rounded-lg bg-slate-100 p-1">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => set({ view: v.id })} className={`px-3 py-1.5 text-sm rounded-md ${view === v.id ? 'bg-white shadow-sm font-medium' : 'text-slate-600'}`}>{v.label}</button>
          ))}
        </div>
        {(view === 'day' || view === 'week') && (
          <div className="flex items-center gap-1">
            <button className="h-10 w-10 rounded-lg border border-slate-200 flex items-center justify-center" onClick={() => set({ date: addDaysYmd(date, -step) })} aria-label="Previous"><ChevronLeft size={16} /></button>
            <input type="date" className={`${inputCls} w-40`} value={date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
            <button className="h-10 w-10 rounded-lg border border-slate-200 flex items-center justify-center" onClick={() => set({ date: addDaysYmd(date, step) })} aria-label="Next"><ChevronRight size={16} /></button>
            <Button variant="ghost" size="sm" onClick={() => set({ date: ymd() })}>Today</Button>
          </div>
        )}
        {view !== 'waitlist' && (
          <select className={`${inputCls} w-56`} value={doctorId} onChange={(e) => set({ doctorId: e.target.value })}>
            <option value="">All doctors</option>
            {doctors?.map((d) => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>)}
          </select>
        )}
      </div>

      {view === 'day' && <DayView date={date} doctorId={doctorId} doctors={doctors ?? []} />}
      {view === 'week' && <WeekView weekStart={weekStart} doctorId={doctorId} />}
      {view === 'list' && <ListView doctorId={doctorId} />}
      {view === 'waitlist' && <WaitlistView />}
    </div>
  );
};

const useAppointments = (key: unknown[], qs: string) =>
  useQuery({
    queryKey: ['appointments', ...key],
    queryFn: async () => unwrapPage<Appointment>(await api.get(`/appointments?${qs}`)),
    refetchInterval: 30_000,
  });

const ApptCard = ({ a, showDoctor }: { a: Appointment; showDoctor?: boolean }) => {
  const qc = useQueryClient();
  const can = useCan();
  const checkIn = useMutation({
    mutationFn: () => api.post(`/appointments/${a.id}/check-in`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments'] }); qc.invalidateQueries({ queryKey: ['queue'] }); },
    onError: (e) => alert(errorMessage(e)),
  });
  return (
    <div className={`rounded-lg border p-2.5 text-sm bg-white ${a.status === 'CANCELLED' || a.status === 'NO_SHOW' ? 'opacity-60' : ''}`}>
      <Link to={`/appointments/${a.id}`} className="block">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-900">{fmtTime(a.scheduledStart)}–{fmtTime(a.scheduledEnd)}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_STYLES[a.status] ?? ''}`}>{statusLabel(a.status)}</span>
        </div>
        <div className="mt-1 font-medium text-slate-800 truncate">{a.patient?.firstName} {a.patient?.lastName}</div>
        <div className="text-xs text-slate-500 truncate">{showDoctor ? `Dr. ${a.doctor?.firstName} ${a.doctor?.lastName} · ` : ''}{a.appointmentType || 'Visit'}</div>
      </Link>
      {['SCHEDULED', 'CONFIRMED'].includes(a.status) && can(['queues.update']) && can('appointments.update') && (
        <button className="mt-2 text-xs font-medium text-[#1FA971] hover:underline" onClick={() => checkIn.mutate()} disabled={checkIn.isPending}>
          {checkIn.isPending ? 'Checking in…' : 'Check in'}
        </button>
      )}
    </div>
  );
};

const Loading = () => <div className="grid gap-3 md:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />)}</div>;

const DayView = ({ date, doctorId, doctors }: { date: string; doctorId: string; doctors: Doctor[] }) => {
  const { data, isLoading, error } = useAppointments(['day', date, doctorId], `date=${date}&limit=200&includeCancelled=true${doctorId ? `&doctorId=${doctorId}` : ''}`);
  const columns = useMemo(() => {
    const list = doctorId ? doctors.filter((d) => d.id === doctorId) : doctors;
    const extra = (data?.items ?? []).filter((a) => !list.some((d) => d.id === a.doctorId)).map((a) => a.doctor!).filter(Boolean);
    const all = [...list, ...extra.filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i)] as Array<{ id: string; firstName: string; lastName: string }>;
    return all.map((d) => ({ doctor: d, items: (data?.items ?? []).filter((a) => a.doctorId === d.id) }));
  }, [data, doctors, doctorId]);

  if (isLoading) return <Loading />;
  if (error) return <div className="p-6 rounded-xl bg-red-50 text-red-700">{errorMessage(error, 'Failed to load appointments')}</div>;
  const total = data?.items.filter((a) => a.status !== 'CANCELLED').length ?? 0;

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">{fmtDay(date)} · {total} appointment(s)</p>
      {columns.length === 0 ? (
        <Card className="text-center py-12"><CalendarIcon className="mx-auto text-slate-300 mb-2" size={40} /><p className="text-slate-500">No doctors in this branch yet.</p></Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map(({ doctor, items }) => (
            <div key={doctor.id} className="min-w-[240px] flex-1 rounded-xl bg-slate-100/70 p-2">
              <div className="px-1 pb-2 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-800">Dr. {doctor.firstName} {doctor.lastName}</span>
                <span className="text-xs text-slate-500">{items.filter((a) => a.status !== 'CANCELLED').length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 ? <p className="text-xs text-slate-400 px-1 py-4 text-center">No bookings</p> : items.map((a) => <ApptCard key={a.id} a={a} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const WeekView = ({ weekStart, doctorId }: { weekStart: string; doctorId: string }) => {
  const end = addDaysYmd(weekStart, 6);
  const { data, isLoading, error } = useAppointments(['week', weekStart, doctorId], `from=${weekStart}&to=${end}&limit=200${doctorId ? `&doctorId=${doctorId}` : ''}`);
  if (isLoading) return <Loading />;
  if (error) return <div className="p-6 rounded-xl bg-red-50 text-red-700">{errorMessage(error, 'Failed to load appointments')}</div>;
  const days = Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart, i));
  const today = ymd();
  return (
    <div className="space-y-2">
      {data && data.total > data.items.length && <p className="text-xs text-amber-700">Showing the first {data.items.length} of {data.total}; filter by doctor to see all.</p>}
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((d) => {
          const items = (data?.items ?? []).filter((a) => ymd(new Date(a.scheduledStart)) === d);
          return (
            <div key={d} className={`rounded-xl p-2 min-h-[120px] ${d === today ? 'bg-[#1FA971]/10' : 'bg-slate-100/70'}`}>
              <div className="text-xs font-semibold text-slate-700 px-1 pb-2">{fmtDay(d)} <span className="text-slate-400 font-normal">({items.length})</span></div>
              <div className="space-y-2">{items.map((a) => <ApptCard key={a.id} a={a} showDoctor={!doctorId} />)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ListView = ({ doctorId }: { doctorId: string }) => {
  const [from, setFrom] = useState(ymd());
  const [to, setTo] = useState(addDaysYmd(ymd(), 30));
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;
  const qs = `from=${from}&to=${to}&page=${page}&limit=${limit}${doctorId ? `&doctorId=${doctorId}` : ''}${status ? `&status=${status}` : '&includeCancelled=true'}`;
  const { data, isLoading, error } = useAppointments(['list', qs], qs);
  const pages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-slate-600 flex flex-col gap-1">From<input type="date" className={`${inputCls} w-40`} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">To<input type="date" className={`${inputCls} w-40`} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Status
          <select className={`${inputCls} w-44`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
      </div>
      {isLoading ? <Loading /> : error ? (
        <div className="p-6 rounded-xl bg-red-50 text-red-700">{errorMessage(error)}</div>
      ) : !data?.items.length ? (
        <Card className="text-center text-slate-500 py-10">No appointments match these filters.</Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Doctor</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap"><Link to={`/appointments/${a.id}`} className="font-medium text-slate-900">{fmtDay(ymd(new Date(a.scheduledStart)))} {fmtTime(a.scheduledStart)}</Link></td>
                  <td className="px-4 py-3">{a.patient?.firstName} {a.patient?.lastName}</td>
                  <td className="px-4 py-3">Dr. {a.doctor?.firstName} {a.doctor?.lastName}</td>
                  <td className="px-4 py-3">{a.appointmentType || '—'}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[a.status] ?? ''}`}>{statusLabel(a.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data && data.total > limit && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {pages} · {data.total} total</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
};

interface WaitEntry { id: string; status: string; preferredDate?: string | null; createdAt: string; patientId: string; doctorId: string; patient: { firstName: string; lastName: string; phone?: string | null }; doctor: { firstName: string; lastName: string } }

const WaitlistView = () => {
  const qc = useQueryClient();
  const can = useCan();
  const { data, isLoading, error } = useQuery({
    queryKey: ['waitlist'],
    queryFn: async () => unwrap<WaitEntry[]>(await api.get('/appointments/waitlist')),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/appointments/waitlist/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waitlist'] }),
    onError: (e) => alert(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/appointments/waitlist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waitlist'] }),
    onError: (e) => alert(errorMessage(e)),
  });
  if (isLoading) return <Loading />;
  if (error) return <div className="p-6 rounded-xl bg-red-50 text-red-700">{errorMessage(error)}</div>;
  if (!data?.length) return <Card className="text-center text-slate-500 py-10">The waitlist is empty. Add patients from the booking form when no suitable slot is free.</Card>;
  return (
    <Card className="p-0 divide-y divide-slate-100">
      {data.map((w) => (
        <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="font-medium">{w.patient.firstName} {w.patient.lastName} <span className="text-xs text-slate-500">for Dr. {w.doctor.firstName} {w.doctor.lastName}</span></div>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              {w.patient.phone && <span className="inline-flex items-center gap-1"><Phone size={12} />{w.patient.phone}</span>}
              {w.preferredDate && <span>Prefers {fmtDay(w.preferredDate.slice(0, 10))}</span>}
              <span className="uppercase">{w.status}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {can('appointments.create') && <Link to={`/appointments/new?patientId=${w.patientId}&doctorId=${w.doctorId}${w.preferredDate ? `&date=${w.preferredDate.slice(0, 10)}` : ''}`}><Button size="sm">Book</Button></Link>}
            {can('appointments.update') && w.status === 'WAITING' && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: w.id, status: 'CONTACTED' })}>Mark contacted</Button>}
            {can('appointments.update') && <button className="p-2 text-slate-400 hover:text-red-600" title="Remove" onClick={() => confirm('Remove from waitlist?') && remove.mutate(w.id)}><Trash2 size={16} /></button>}
          </div>
        </div>
      ))}
    </Card>
  );
};
