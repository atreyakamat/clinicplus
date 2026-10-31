import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Trash2, Plus, CalendarOff } from 'lucide-react';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import { AvailabilityEditor } from './AvailabilityEditor';
import { SlotPicker } from '../appointments/SlotPicker';
import { type AvailabilityBlock, type Doctor, errorMessage, fmtDate, fmtTime, inputCls, unwrap, ymd } from './scheduling';

interface Leave { id: string; startDate: string; endDate: string; reason?: string | null }
type DoctorDetail = Doctor & { availability: AvailabilityBlock[]; upcomingLeaves: Leave[]; timezone: string };

const PROFILE_FIELDS: Array<{ key: keyof Doctor; label: string; type?: string; textarea?: boolean }> = [
  { key: 'qualification', label: 'Qualification' },
  { key: 'specialization', label: 'Specialization' },
  { key: 'registrationNumber', label: 'Registration number' },
  { key: 'experienceYears', label: 'Experience (years)', type: 'number' },
  { key: 'consultationFee', label: 'Consultation fee', type: 'number' },
  { key: 'phone', label: 'Phone' },
  { key: 'signatureUrl', label: 'Signature image URL' },
  { key: 'bio', label: 'Bio', textarea: true },
];

export const DoctorProfilePage = () => {
  const { id = '' } = useParams();
  const can = useCan();
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'profile' | 'availability' | 'leave' | 'slots'>('profile');
  const editable = can('doctors.manage') || (can('doctors.update_own') && me?.id === id);

  const { data: doctor, isLoading, error } = useQuery<DoctorDetail>({
    queryKey: ['doctor', id],
    queryFn: async () => unwrap<DoctorDetail>(await api.get(`/doctors/${id}`)),
  });

  if (isLoading) return <div className="h-64 rounded-xl bg-slate-100 animate-pulse" />;
  if (error || !doctor) return <div className="p-6 rounded-xl bg-red-50 text-red-700">{errorMessage(error, 'Doctor not found')}</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <Link to="/doctors" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"><ArrowLeft size={14} /> All doctors</Link>
      <PageHeader
        title={`Dr. ${doctor.firstName} ${doctor.lastName}`}
        description={[doctor.specialization, doctor.qualification, doctor.email].filter(Boolean).join(' · ')}
      />
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {(['profile', 'availability', 'leave', 'slots'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-[#1FA971] text-[#1FA971]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t === 'slots' ? 'Open slots' : t === 'availability' ? 'Weekly schedule' : t}
          </button>
        ))}
      </div>
      {tab === 'profile' && <ProfileForm doctor={doctor} editable={editable} />}
      {tab === 'availability' && (
        <Card>
          <p className="text-sm text-slate-500 mb-4">Times are in the branch timezone ({doctor.timezone}). Bookings outside these hours are rejected.</p>
          <AvailabilityEditor doctorId={doctor.id} initial={doctor.availability} editable={editable} />
        </Card>
      )}
      {tab === 'leave' && <LeavePanel doctorId={doctor.id} editable={editable} timezone={doctor.timezone} />}
      {tab === 'slots' && <SlotsPreview doctorId={doctor.id} timezone={doctor.timezone} />}
    </div>
  );
};

const ProfileForm = ({ doctor, editable }: { doctor: DoctorDetail; editable: boolean }) => {
  const qc = useQueryClient();
  const initial = useMemo(() => Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, doctor[f.key] ?? ''])), [doctor]);
  const [form, setForm] = useState<Record<string, any>>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setForm(initial), [initial]);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const f of PROFILE_FIELDS) {
        const v = form[f.key as string];
        if (v === '' || v === null || v === undefined) continue;
        body[f.key as string] = f.type === 'number' ? Number(v) : String(v);
      }
      return api.patch(`/doctors/${doctor.id}`, body);
    },
    onSuccess: () => { setMsg({ ok: true, text: 'Profile saved' }); qc.invalidateQueries({ queryKey: ['doctor', doctor.id] }); qc.invalidateQueries({ queryKey: ['doctors'] }); },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });

  return (
    <Card>
      <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {PROFILE_FIELDS.map((f) => (
          <label key={f.key} className={`text-sm text-slate-700 flex flex-col gap-1 ${f.textarea ? 'md:col-span-2' : ''}`}>
            {f.label}
            {f.textarea ? (
              <textarea disabled={!editable} className={`${inputCls} h-28 py-2`} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <input disabled={!editable} type={f.type ?? 'text'} min={f.type === 'number' ? 0 : undefined} step={f.key === 'consultationFee' ? '0.01' : undefined} className={inputCls} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
        {doctor.signatureUrl && /^https?:|^data:image/.test(doctor.signatureUrl) && (
          <div className="md:col-span-2"><p className="text-xs text-slate-500 mb-1">Current signature</p><img src={doctor.signatureUrl} alt="Signature" className="h-16 border rounded bg-white p-1" /></div>
        )}
        {msg && <p className={`md:col-span-2 text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
        {editable ? (
          <div className="md:col-span-2"><Button type="submit" className="gap-2" disabled={save.isPending}><Save size={16} /> {save.isPending ? 'Saving…' : 'Save profile'}</Button></div>
        ) : (
          <p className="md:col-span-2 text-xs text-slate-500">Read only — you can edit only your own profile.</p>
        )}
      </form>
    </Card>
  );
};

const LeavePanel = ({ doctorId, editable, timezone }: { doctorId: string; editable: boolean; timezone: string }) => {
  const qc = useQueryClient();
  const today = ymd(new Date(), timezone);
  const [form, setForm] = useState({ startDate: today, endDate: today, reason: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data: leaves, isLoading, error } = useQuery<Leave[]>({
    queryKey: ['doctor', doctorId, 'leaves'],
    queryFn: async () => unwrap<Leave[]>(await api.get(`/doctors/${doctorId}/leaves?from=${today}`)),
  });
  const create = useMutation({
    mutationFn: async () => unwrap<Leave & { conflictingAppointments: number }>(await api.post(`/doctors/${doctorId}/leaves`, { ...form, reason: form.reason || undefined })),
    onSuccess: (l) => {
      setMsg({ ok: true, text: l.conflictingAppointments ? `Leave added. ${l.conflictingAppointments} existing appointment(s) fall in this period — please reschedule them.` : 'Leave added' });
      qc.invalidateQueries({ queryKey: ['doctor', doctorId] });
      qc.invalidateQueries({ queryKey: ['slots'] });
    },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });
  const remove = useMutation({
    mutationFn: (leaveId: string) => api.delete(`/doctors/${doctorId}/leaves/${leaveId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['doctor', doctorId] }); qc.invalidateQueries({ queryKey: ['slots'] }); },
    onError: (e) => alert(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      {editable && (
        <Card>
          <form className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-3 items-end" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <label className="text-sm flex flex-col gap-1">From<input required type="date" className={inputCls} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label className="text-sm flex flex-col gap-1">To (inclusive)<input required type="date" className={inputCls} min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
            <label className="text-sm flex flex-col gap-1">Reason<input className={inputCls} placeholder="e.g. Conference" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
            <Button type="submit" className="gap-2" disabled={create.isPending}><Plus size={16} /> Add leave</Button>
          </form>
          {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
        </Card>
      )}
      {isLoading ? <div className="h-24 rounded-xl bg-slate-100 animate-pulse" /> : error ? (
        <div className="p-4 rounded-xl bg-red-50 text-red-700">{errorMessage(error)}</div>
      ) : !leaves?.length ? (
        <Card className="text-center text-slate-500 py-10"><CalendarOff className="mx-auto mb-2 text-slate-300" />No upcoming leave.</Card>
      ) : (
        <Card className="p-0 divide-y divide-slate-100">
          {leaves.map((l) => {
            const end = new Date(new Date(l.endDate).getTime() - 1);
            const midnight = (iso: string) => fmtTime(iso, timezone) === fmtTime(new Date(`2000-01-01T00:00:00`), undefined);
            const wholeDays = midnight(l.startDate) && midnight(l.endDate);
            return (
              <div key={l.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-sm">
                    {wholeDays
                      ? `${fmtDate(l.startDate, timezone)} → ${fmtDate(end, timezone)} (full days)`
                      : `${fmtDate(l.startDate, timezone)} ${fmtTime(l.startDate, timezone)} → ${fmtDate(l.endDate, timezone)} ${fmtTime(l.endDate, timezone)}`}
                  </div>
                  {l.reason && <div className="text-xs text-slate-500">{l.reason}</div>}
                </div>
                {editable && <button className="p-1 text-slate-400 hover:text-red-600" onClick={() => confirm('Delete this leave?') && remove.mutate(l.id)}><Trash2 size={16} /></button>}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
};

const SlotsPreview = ({ doctorId, timezone }: { doctorId: string; timezone: string }) => {
  const [date, setDate] = useState(ymd(new Date(), timezone));
  return (
    <Card>
      <SlotPicker doctorId={doctorId} date={date} onDateChange={setDate} />
    </Card>
  );
};
