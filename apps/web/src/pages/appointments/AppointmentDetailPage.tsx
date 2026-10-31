import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calendar, Clock, User, Stethoscope, Phone, X } from 'lucide-react';
import { Button, Card } from '@clinicplus/ui';
import { api, ApiError } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import { SlotPicker } from './SlotPicker';
import { type Appointment, type DaySlots, type Slot, STATUS_STYLES, errorMessage, fmtDate, fmtTime, inputCls, statusLabel, unwrap, ymd } from '../doctors/scheduling';

type Detail = Appointment & { queueEntries?: Array<{ id: string; tokenNumber: number; status: string }> };

export const AppointmentDetailPage = () => {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const can = useCan();
  const me = useAuthStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  const { data: a, isLoading, error: loadError } = useQuery<Detail>({
    queryKey: ['appointment', id],
    queryFn: async () => unwrap<Detail>(await api.get(`/appointments/${id}`)),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['appointment', id] });
    qc.invalidateQueries({ queryKey: ['appointments'] });
    qc.invalidateQueries({ queryKey: ['queue'] });
    qc.invalidateQueries({ queryKey: ['slots'] });
  };

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(`/appointments/${id}/${path}`, body ?? {}),
    onSuccess: () => { setError(null); refresh(); },
    onError: (e) => setError(errorMessage(e)),
  });

  const saveNotes = useMutation({
    mutationFn: () => api.patch(`/appointments/${id}`, { notes: notes ?? '' }),
    onSuccess: () => { setNotes(null); refresh(); },
    onError: (e) => setError(errorMessage(e)),
  });

  if (isLoading) return <div className="h-64 rounded-xl bg-slate-100 animate-pulse" />;
  if (loadError || !a) return <div className="p-6 rounded-xl bg-red-50 text-red-700">{errorMessage(loadError, 'Appointment not found')}</div>;

  // Doctors without front-desk rights may only act on their own appointments (enforced by the API too).
  const mine = !me?.roles?.includes('Doctor') || can('appointments.create') || a.doctorId === me?.id;
  const canUpdate = can('appointments.update') && mine;
  const started = new Date(a.scheduledStart) <= new Date();
  const s = a.status;
  const token = a.queueEntries?.find((q) => ['WAITING', 'CALLED', 'IN_PROGRESS'].includes(q.status));

  const cancel = () => {
    const reason = prompt('Reason for cancellation');
    if (reason && reason.trim()) action.mutate({ path: 'cancel', body: { reason: reason.trim() } });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/appointments" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"><ArrowLeft size={14} /> Appointments</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{a.patient?.firstName} {a.patient?.lastName}</h1>
          <p className="text-slate-500 text-sm">{a.appointmentType || 'Appointment'} · {fmtDate(a.scheduledStart)} {fmtTime(a.scheduledStart)}</p>
        </div>
        <span className={`text-sm font-medium px-3 py-1 rounded-full border ${STATUS_STYLES[s] ?? ''}`}>{statusLabel(s)}</span>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <Info icon={<Calendar size={16} />} label="Date" value={fmtDate(a.scheduledStart)} />
            <Info icon={<Clock size={16} />} label="Time" value={`${fmtTime(a.scheduledStart)} – ${fmtTime(a.scheduledEnd)}`} />
            <Info icon={<Stethoscope size={16} />} label="Doctor" value={`Dr. ${a.doctor?.firstName ?? ''} ${a.doctor?.lastName ?? ''}`} />
            <Info icon={<User size={16} />} label="Patient" value={<Link className="text-[#1FA971]" to={`/patients/${a.patientId}`}>{a.patient?.firstName} {a.patient?.lastName}</Link>} />
            {a.patient?.phone && <Info icon={<Phone size={16} />} label="Phone" value={a.patient.phone} />}
            {token && <Info icon={<Clock size={16} />} label="Queue token" value={`#${token.tokenNumber} (${statusLabel(token.status)})`} />}
          </div>
          {a.cancellationReason && <p className="text-sm text-red-700 bg-red-50 rounded p-2">Cancelled: {a.cancellationReason}</p>}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Notes</h3>
              {canUpdate && notes === null && <button className="text-xs text-[#1FA971]" onClick={() => setNotes(a.notes ?? '')}>Edit</button>}
            </div>
            {notes === null ? (
              <p className="text-sm text-slate-600 whitespace-pre-wrap mt-1">{a.notes || '—'}</p>
            ) : (
              <div className="space-y-2 mt-1">
                <textarea className={`${inputCls} h-24 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
                <div className="flex gap-2"><Button size="sm" onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}>Save</Button><Button size="sm" variant="ghost" onClick={() => setNotes(null)}>Cancel</Button></div>
              </div>
            )}
          </div>
        </Card>

        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Actions</h3>
          {canUpdate && s === 'SCHEDULED' && <Button className="w-full" variant="outline" onClick={() => action.mutate({ path: 'confirm' })} disabled={action.isPending}>Confirm</Button>}
          {canUpdate && can('queues.update') && ['SCHEDULED', 'CONFIRMED'].includes(s) && <Button className="w-full" onClick={() => action.mutate({ path: 'check-in' })} disabled={action.isPending}>Check in (issue token)</Button>}
          {canUpdate && ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(s) && <Button className="w-full" variant="outline" onClick={() => action.mutate({ path: 'start' })} disabled={action.isPending}>Start consultation</Button>}
          {canUpdate && ['CHECKED_IN', 'IN_PROGRESS'].includes(s) && <Button className="w-full" onClick={() => action.mutate({ path: 'complete' })} disabled={action.isPending}>Mark completed</Button>}
          {canUpdate && ['SCHEDULED', 'CONFIRMED'].includes(s) && <Button className="w-full" variant="outline" onClick={() => setRescheduling(true)}>Reschedule</Button>}
          {canUpdate && ['SCHEDULED', 'CONFIRMED'].includes(s) && started && <Button className="w-full" variant="outline" onClick={() => confirm('Mark as no-show?') && action.mutate({ path: 'no-show' })} disabled={action.isPending}>Mark no-show</Button>}
          {can('appointments.delete') && ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(s) && <Button className="w-full" variant="danger" onClick={cancel} disabled={action.isPending}>Cancel appointment</Button>}
          {['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(s) && <p className="text-sm text-slate-500">This appointment is closed.</p>}
          {!canUpdate && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(s) && <p className="text-xs text-slate-500">You can view but not change this appointment.</p>}
        </Card>
      </div>

      {rescheduling && <RescheduleDialog appointment={a} onClose={() => setRescheduling(false)} onDone={() => { setRescheduling(false); refresh(); }} />}
    </div>
  );
};

const Info = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-2">
    <span className="text-slate-400 mt-0.5">{icon}</span>
    <div><div className="text-xs text-slate-500">{label}</div><div className="font-medium text-slate-900">{value}</div></div>
  </div>
);

export const RescheduleDialog = ({ appointment, onClose, onDone }: { appointment: Appointment; onClose: () => void; onDone: () => void }) => {
  const can = useCan();
  const [date, setDate] = useState(ymd(new Date(appointment.scheduledStart)));
  const [slot, setSlot] = useState<{ slot: Slot; day: DaySlots } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<{ text: string; canForce: boolean } | null>(null);
  const duration = Math.round((new Date(appointment.scheduledEnd).getTime() - new Date(appointment.scheduledStart).getTime()) / 60000);

  const save = useMutation({
    mutationFn: (force: boolean) => {
      if (!slot) throw new Error('Pick a new slot');
      return api.post(`/appointments/${appointment.id}/reschedule`, {
        scheduledStart: slot.slot.start,
        scheduledEnd: new Date(new Date(slot.slot.start).getTime() + duration * 60000).toISOString(),
        reason: reason || undefined,
        ...(force ? { force: true } : {}),
      });
    },
    onSuccess: onDone,
    onError: (e) => {
      const text = errorMessage(e);
      setError({ text, canForce: e instanceof ApiError && e.status === 409 && /Slot not available/.test(text) && can('appointments.update') });
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Reschedule appointment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-500">Currently {fmtDate(appointment.scheduledStart)} {fmtTime(appointment.scheduledStart)} · {duration} min</p>
        <SlotPicker
          doctorId={appointment.doctorId}
          date={date}
          onDateChange={(d) => { setDate(d); setSlot(null); }}
          duration={duration}
          excludeAppointmentId={appointment.id}
          value={slot?.slot.start}
          onSelect={(s, day) => { setSlot({ slot: s, day }); setError(null); }}
        />
        <input className={inputCls} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 space-y-2">
            <p>{error.text}</p>
            {error.canForce && <Button size="sm" variant="danger" onClick={() => save.mutate(true)}>Reschedule anyway</Button>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button disabled={!slot || save.isPending} onClick={() => save.mutate(false)}>{save.isPending ? 'Saving…' : 'Reschedule'}</Button>
        </div>
      </div>
    </div>
  );
};
