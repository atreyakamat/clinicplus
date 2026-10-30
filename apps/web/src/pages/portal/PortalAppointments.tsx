import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Loader2, X } from 'lucide-react';
import { portalApi, portalErrorMessage, unwrap } from './portal.api';
import { Card, PageTitle, QueryState, StatusPill, fmtDateTime } from './portal.ui';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function PortalAppointments() {
  const qc = useQueryClient();
  const [booking, setBooking] = useState(false);

  const list = useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => portalApi.get('/appointments').then(unwrap) });

  const cancel = useMutation({
    mutationFn: (id: string) => portalApi.delete(`/appointments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'appointments'] }),
  });

  const upcoming = list.data?.upcoming ?? [];
  const past = list.data?.past ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageTitle title="Appointments" />
        <button
          onClick={() => setBooking(true)}
          className="flex items-center gap-1.5 bg-clinic-green text-white text-sm font-medium px-3 py-2 rounded-xl"
        >
          <CalendarPlus className="w-4 h-4" /> Book
        </button>
      </div>

      <QueryState isLoading={list.isLoading} error={list.error} isEmpty={!upcoming.length && !past.length} emptyText="No appointments yet.">
        {upcoming.length > 0 && (
          <>
            <h2 className="text-xs font-semibold text-slate-400 uppercase mb-2">Upcoming</h2>
            <div className="space-y-2 mb-6">
              {upcoming.map((a: any) => (
                <Card key={a.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{fmtDateTime(a.scheduledStart)}</p>
                      <p className="text-sm text-slate-500">
                        Dr. {a.doctor?.firstName} {a.doctor?.lastName}
                        {a.doctor?.specialization ? ` · ${a.doctor.specialization}` : ''}
                      </p>
                      <div className="mt-1"><StatusPill status={a.status} /></div>
                    </div>
                    <button
                      onClick={() => cancel.mutate(a.id)}
                      disabled={cancel.isPending}
                      className="text-xs font-medium text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {past.length > 0 && (
          <>
            <h2 className="text-xs font-semibold text-slate-400 uppercase mb-2">Past</h2>
            <div className="space-y-2">
              {past.map((a: any) => (
                <Card key={a.id} className="p-4 opacity-90">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{fmtDateTime(a.scheduledStart)}</p>
                      <p className="text-sm text-slate-500">Dr. {a.doctor?.firstName} {a.doctor?.lastName}</p>
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </QueryState>

      {cancel.error && <p className="mt-3 text-sm text-red-600">{portalErrorMessage(cancel.error)}</p>}
      {booking && <BookingSheet onClose={() => setBooking(false)} onBooked={() => { setBooking(false); qc.invalidateQueries({ queryKey: ['portal', 'appointments'] }); }} />}
    </div>
  );
}

function BookingSheet({ onClose, onBooked }: { onClose: () => void; onBooked: () => void }) {
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(todayStr());

  const doctors = useQuery({ queryKey: ['portal', 'doctors'], queryFn: () => portalApi.get('/doctors').then(unwrap) });
  const slots = useQuery({
    queryKey: ['portal', 'slots', doctorId, date],
    queryFn: () => portalApi.get(`/doctors/${doctorId}/slots?date=${date}`).then(unwrap),
    enabled: !!doctorId && !!date,
  });

  const book = useMutation({
    mutationFn: (slot: { start: string; end: string }) =>
      portalApi.post('/appointments', { doctorId, scheduledStart: slot.start, scheduledEnd: slot.end }),
    onSuccess: onBooked,
  });

  const available = (slots.data?.slots ?? []).filter((s: any) => s.available);

  return (
    <div className="fixed inset-0 z-20 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">Book an appointment</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <label className="block text-xs font-medium text-slate-600 mb-1">Doctor</label>
        <select
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          className="w-full mb-3 rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
        >
          <option value="">Select a doctor</option>
          {(doctors.data ?? []).map((d: any) => (
            <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}{d.specialization ? ` — ${d.specialization}` : ''}</option>
          ))}
        </select>

        <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
        <input
          type="date"
          value={date}
          min={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full mb-4 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
        />

        {doctorId && (
          <QueryState isLoading={slots.isLoading} error={slots.error} isEmpty={!available.length} emptyText={slots.data?.reason || 'No open slots on this day.'}>
            <div className="grid grid-cols-3 gap-2">
              {available.map((s: any) => (
                <button
                  key={s.start}
                  disabled={book.isPending}
                  onClick={() => book.mutate({ start: s.start, end: s.end })}
                  className="text-sm font-medium border border-slate-300 rounded-xl py-2 hover:border-clinic-green hover:text-clinic-green disabled:opacity-50"
                >
                  {s.time}
                </button>
              ))}
            </div>
          </QueryState>
        )}

        {book.isPending && <p className="mt-3 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Booking…</p>}
        {book.error && <p className="mt-3 text-sm text-red-600">{portalErrorMessage(book.error)}</p>}
      </div>
    </div>
  );
}
