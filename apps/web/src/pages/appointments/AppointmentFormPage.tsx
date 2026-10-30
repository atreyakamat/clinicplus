import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search, ListPlus } from 'lucide-react';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { api, ApiError } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';
import { SlotPicker } from './SlotPicker';
import { type DaySlots, type Doctor, type Slot, errorMessage, fmtDate, fmtTime, inputCls, unwrap, unwrapPage, ymd } from '../doctors/scheduling';

interface PatientLite { id: string; firstName: string; lastName: string; phone?: string | null; patientCode?: string | null }
interface Service { id: string; name: string; duration: number; price: string | number }

export const AppointmentFormPage = () => {
  const navigate = useNavigate();
  const can = useCan();
  const [params] = useSearchParams();
  const [patientQuery, setPatientQuery] = useState('');
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [doctorId, setDoctorId] = useState(params.get('doctorId') ?? '');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(params.get('date') ?? ymd());
  const [slot, setSlot] = useState<{ slot: Slot; day: DaySlots } | null>(null);
  const [appointmentType, setAppointmentType] = useState('Consultation');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<{ text: string; canForce: boolean } | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Prefill the patient from ?patientId=
  const prefillId = params.get('patientId');
  const { data: prefill } = useQuery({
    queryKey: ['patient', prefillId],
    enabled: !!prefillId,
    queryFn: async () => unwrap<PatientLite>(await api.get(`/patients/${prefillId}`)),
  });
  useEffect(() => { if (prefill && !patient) setPatient(prefill); }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: patientResults, isFetching: searching } = useQuery({
    queryKey: ['patients', 'picker', patientQuery],
    enabled: patientQuery.trim().length >= 2,
    queryFn: async () => unwrapPage<PatientLite>(await api.get(`/patients?q=${encodeURIComponent(patientQuery.trim())}&limit=8`)).items,
  });

  const { data: doctors, isLoading: doctorsLoading } = useQuery<Doctor[]>({
    queryKey: ['doctors', ''],
    queryFn: async () => unwrap<Doctor[]>(await api.get('/doctors')),
  });

  const { data: services } = useQuery({
    queryKey: ['clinic-services', 'active'],
    enabled: can('services.view'),
    queryFn: async () => unwrapPage<Service>(await api.get('/clinic-settings/services?limit=200')).items,
  });
  const service = useMemo(() => services?.find((s) => s.id === serviceId), [services, serviceId]);

  useEffect(() => setSlot(null), [doctorId, date, serviceId]);

  const book = useMutation({
    mutationFn: async (force: boolean) => {
      if (!patient) throw new Error('Select a patient');
      if (!slot) throw new Error('Select a time slot');
      return unwrap<{ id: string }>(
        await api.post('/appointments', {
          patientId: patient.id,
          doctorId,
          scheduledStart: slot.slot.start,
          scheduledEnd: slot.slot.end,
          appointmentType: service?.name ?? (appointmentType || undefined),
          notes: notes || undefined,
          ...(force ? { force: true } : {}),
        }),
      );
    },
    onSuccess: (a) => navigate(`/appointments/${a.id}`),
    onError: (e) => {
      const text = errorMessage(e);
      setError({ text, canForce: e instanceof ApiError && e.status === 409 && /Slot not available/.test(text) && can('appointments.update') });
    },
  });

  const waitlist = useMutation({
    mutationFn: () => api.post('/appointments/waitlist', { patientId: patient!.id, doctorId, preferredDate: date }),
    onSuccess: () => setInfo('Added to the waitlist. You will find it under Appointments → Waitlist.'),
    onError: (e) => setError({ text: errorMessage(e), canForce: false }),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/appointments" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"><ArrowLeft size={14} /> Appointments</Link>
      <PageHeader title="Book appointment" description="Pick a patient, a doctor and an open slot." />

      <Card className="space-y-4">
        <h2 className="font-semibold">1. Patient</h2>
        {patient ? (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div>
              <div className="font-medium">{patient.firstName} {patient.lastName}</div>
              <div className="text-xs text-slate-500">{[patient.patientCode, patient.phone].filter(Boolean).join(' · ')}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPatient(null)}>Change</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input autoFocus className={`${inputCls} pl-9`} placeholder="Search by name, phone or patient ID (min 2 characters)" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
            </div>
            {searching && <p className="text-xs text-slate-400">Searching…</p>}
            {patientResults && patientResults.length === 0 && <p className="text-sm text-slate-500">No patients found. <Link className="text-[#1FA971]" to="/patients/new">Register a new patient</Link></p>}
            <div className="divide-y divide-slate-100">
              {patientResults?.map((p) => (
                <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded" onClick={() => setPatient(p)}>
                  <span className="font-medium">{p.firstName} {p.lastName}</span>
                  <span className="text-xs text-slate-500 ml-2">{[p.patientCode, p.phone].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">2. Doctor & service</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm flex flex-col gap-1">
            Doctor *
            <select className={inputCls} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={doctorsLoading}>
              <option value="">{doctorsLoading ? 'Loading…' : 'Select doctor'}</option>
              {doctors?.map((d) => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}{d.specialization ? ` — ${d.specialization}` : ''}</option>)}
            </select>
          </label>
          {services && services.length > 0 ? (
            <label className="text-sm flex flex-col gap-1">
              Service
              <select className={inputCls} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Default slot length</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration} min · {Number(s.price).toFixed(2)}</option>)}
              </select>
            </label>
          ) : (
            <label className="text-sm flex flex-col gap-1">
              Visit type
              <input className={inputCls} value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)} />
            </label>
          )}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">3. Date & time</h2>
        <SlotPicker
          doctorId={doctorId}
          date={date}
          onDateChange={setDate}
          duration={service?.duration}
          value={slot?.slot.start}
          onSelect={(s, day) => { setSlot({ slot: s, day }); setError(null); }}
        />
        {slot && <p className="text-sm text-slate-700">Selected: <strong>{fmtDate(slot.slot.start, slot.day.timezone)} {fmtTime(slot.slot.start, slot.day.timezone)}–{fmtTime(slot.slot.end, slot.day.timezone)}</strong></p>}
        {patient && doctorId && can('appointments.create') && (
          <button type="button" className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1" onClick={() => waitlist.mutate()} disabled={waitlist.isPending}>
            <ListPlus size={14} /> No suitable slot? Add to waitlist for this doctor
          </button>
        )}
        {info && <p className="text-sm text-green-700">{info}</p>}
      </Card>

      <Card className="space-y-3">
        <label className="text-sm flex flex-col gap-1">Notes<textarea className={`${inputCls} h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for visit, symptoms…" /></label>
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 space-y-2">
            <p>{error.text}</p>
            {error.canForce && <Button size="sm" variant="danger" onClick={() => book.mutate(true)} disabled={book.isPending}>Book anyway (override schedule)</Button>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate('/appointments')}>Cancel</Button>
          <Button onClick={() => book.mutate(false)} disabled={!patient || !doctorId || !slot || book.isPending}>{book.isPending ? 'Booking…' : 'Book appointment'}</Button>
        </div>
      </Card>
    </div>
  );
};
