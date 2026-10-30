import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, Phone, Plus, TrendingDown, Users } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import {
  ErrorBox,
  Modal,
  Pager,
  PatientPicker,
  dateInputToIso,
  fmtDate,
  getData,
  getList,
  inputCls,
  personName,
  qs,
  toDateInput,
} from '../tasks/ui';
import type { PatientOption } from '../tasks/ui';

type FollowUpStatus = 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';

interface FollowUp {
  id: string;
  patientId: string;
  scheduledDate: string;
  status: FollowUpStatus;
  reason?: string | null;
  notes?: string | null;
  appointmentId?: string | null;
  isOverdue: boolean;
  reminderCount?: number;
  patient: { id: string; firstName: string; lastName: string; phone?: string | null };
  doctor: { id: string; firstName: string; lastName: string };
  outcomes: { id: string; outcomeType: string; remarks?: string | null; recordedAt: string }[];
}

interface Metrics {
  total: number;
  byStatus: Record<FollowUpStatus, number>;
  due: number;
  completionRate: number;
  missedRate: number;
  overdue: number;
  upcoming7d: number;
  atRiskCount: number;
  atRiskPatients: {
    followUpId: string;
    patient: { id: string; firstName: string; lastName: string; phone?: string | null };
    doctor: { firstName: string; lastName: string };
    missedDate: string;
    reason?: string | null;
    daysSinceMissed: number;
  }[];
}

interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
}

const STATUS_VARIANT: Record<FollowUpStatus, 'default' | 'info' | 'success' | 'error' | 'outline'> = {
  PENDING: 'default',
  SCHEDULED: 'info',
  COMPLETED: 'success',
  MISSED: 'error',
  CANCELLED: 'outline',
};

const OUTCOMES = [
  ['RECOVERED', 'Recovered'],
  ['IMPROVING', 'Improving'],
  ['NO_CHANGE', 'No change'],
  ['WORSENED', 'Worsened'],
  ['NEEDS_VISIT', 'Needs a visit'],
  ['REFERRED', 'Referred'],
  ['UNREACHABLE', 'Could not reach'],
  ['OTHER', 'Other'],
] as const;

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export const FollowUpsPage = () => {
  const can = useCan();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [recording, setRecording] = useState<FollowUp | null>(null);
  const [creating, setCreating] = useState(false);

  const filters = {
    status,
    doctorId,
    from: from ? dateInputToIso(from, 0) : '',
    to: to ? dateInputToIso(to, 23) : '',
    overdue,
    search: search.trim().length >= 2 ? search.trim() : '',
    page,
    limit: 25,
  };
  const list = useQuery({
    queryKey: ['follow-ups', filters],
    queryFn: () => getList<FollowUp>(`/follow-ups${qs(filters)}`),
  });
  const metrics = useQuery({
    queryKey: ['follow-ups', 'metrics', doctorId],
    queryFn: () => getData<Metrics>(`/follow-ups/metrics${qs({ doctorId })}`),
  });
  const doctors = useQuery({
    queryKey: ['follow-ups', 'doctors'],
    queryFn: () => getData<Doctor[]>('/follow-ups/doctors'),
    staleTime: 5 * 60_000,
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: FollowUpStatus }) => api.patch(`/follow-ups/${id}/status`, { status: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-ups'] }),
  });

  const m = metrics.data;
  const items = list.data?.items ?? [];
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    setPage(1);
    fn(v);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-ups"
        description="Make sure every patient who should come back actually does."
        actions={
          <HasPermission permission="follow_ups.create">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={16} className="mr-1" /> Plan follow-up
            </Button>
          </HasPermission>
        }
      />

      <ErrorBox error={metrics.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric icon={<CheckCircle2 size={16} className="text-[#1FA971]" />} label="Completion rate" value={m ? `${m.completionRate}%` : '—'} hint={m ? `${m.byStatus.COMPLETED} of ${m.due} due` : ''} />
        <Metric icon={<TrendingDown size={16} className="text-red-500" />} label="Missed rate" value={m ? `${m.missedRate}%` : '—'} hint={m ? `${m.byStatus.MISSED} missed` : ''} />
        <Metric icon={<AlertTriangle size={16} className="text-orange-500" />} label="Overdue now" value={m?.overdue ?? '—'} hint="Open and past date" />
        <Metric icon={<CalendarClock size={16} className="text-[#2563EB]" />} label="Next 7 days" value={m?.upcoming7d ?? '—'} hint="Upcoming follow-ups" />
        <Metric icon={<Users size={16} className="text-red-600" />} label="At-risk patients" value={m?.atRiskCount ?? '—'} hint="Missed, nothing booked" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            className={`${inputCls} lg:col-span-2`}
            placeholder="Search patient name or phone"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            aria-label="Search"
          />
          <select className={inputCls} value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {(['PENDING', 'SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED'] as FollowUpStatus[]).map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
          <select className={inputCls} value={doctorId} onChange={(e) => resetPage(setDoctorId)(e.target.value)} aria-label="Doctor">
            <option value="">All doctors</option>
            {doctors.data?.map((d) => (
              <option key={d.id} value={d.id}>Dr. {personName(d)}</option>
            ))}
          </select>
          <input type="date" className={inputCls} value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} aria-label="From date" />
          <input type="date" className={inputCls} value={to} onChange={(e) => resetPage(setTo)(e.target.value)} aria-label="To date" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={overdue} onChange={(e) => resetPage(setOverdue)(e.target.checked)} />
          Only overdue
        </label>
      </Card>

      <ErrorBox error={list.error || setStatusMutation.error} />

      <Card className="overflow-hidden p-0">
        {list.isLoading ? (
          <div className="p-6 text-sm text-slate-500">Loading follow-ups…</div>
        ) : !items.length ? (
          <div className="p-10 text-center text-sm text-slate-500">No follow-ups match these filters.</div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y md:hidden">
              {items.map((f) => (
                <li key={f.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/patients/${f.patient.id}`} className="font-medium text-slate-900">{personName(f.patient)}</Link>
                    <StatusBadge f={f} />
                  </div>
                  <div className={`text-sm ${f.isOverdue ? 'text-red-600' : 'text-slate-600'}`}>{fmtDate(f.scheduledDate)} · Dr. {personName(f.doctor)}</div>
                  {f.reason && <div className="text-sm text-slate-500">{f.reason}</div>}
                  <RowActions f={f} can={can} onReschedule={setRescheduling} onRecord={setRecording} onStatus={(next) => setStatusMutation.mutate({ id: f.id, next })} />
                </li>
              ))}
            </ul>
            {/* Desktop table */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Reason / last outcome</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((f) => (
                  <tr key={f.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link to={`/patients/${f.patient.id}`} className="font-medium text-slate-900 hover:underline">{personName(f.patient)}</Link>
                      {f.patient.phone && (
                        <a href={`tel:${f.patient.phone}`} className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <Phone size={11} /> {f.patient.phone}
                        </a>
                      )}
                    </td>
                    <td className={`px-4 py-3 ${f.isOverdue ? 'font-medium text-red-600' : 'text-slate-700'}`}>
                      {fmtDate(f.scheduledDate)}
                      {f.isOverdue && <div className="text-xs">overdue</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">Dr. {personName(f.doctor)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {f.reason ?? '—'}
                      {f.outcomes[0] && (
                        <div className="text-xs text-slate-500">
                          Outcome: {label(f.outcomes[0].outcomeType)}
                          {f.outcomes[0].remarks ? ` — ${f.outcomes[0].remarks}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge f={f} /></td>
                    <td className="px-4 py-3">
                      <RowActions f={f} can={can} onReschedule={setRescheduling} onRecord={setRecording} onStatus={(next) => setStatusMutation.mutate({ id: f.id, next })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="px-4">
          <Pager meta={list.data?.meta} page={page} onPage={setPage} />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
          <AlertTriangle size={16} className="text-red-500" /> At-risk patients
        </h3>
        <p className="mb-4 text-sm text-slate-500">
          Missed their follow-up and have no later appointment. A call task is created for the front desk automatically.
        </p>
        {!m?.atRiskPatients.length ? (
          <p className="text-sm text-slate-500">No at-risk patients. Everyone who missed has been rebooked.</p>
        ) : (
          <ul className="divide-y">
            {m.atRiskPatients.map((r) => (
              <li key={r.followUpId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <Link to={`/patients/${r.patient.id}`} className="font-medium text-slate-900 hover:underline">{personName(r.patient)}</Link>
                  <div className="text-xs text-slate-500">
                    Missed {fmtDate(r.missedDate)} ({r.daysSinceMissed}d ago) · Dr. {personName(r.doctor)}
                    {r.reason ? ` · ${r.reason}` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.patient.phone && (
                    <a href={`tel:${r.patient.phone}`} className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-sm">
                      <Phone size={14} /> Call
                    </a>
                  )}
                  <HasPermission permission="appointments.create">
                    <Link to="/appointments/new" className="inline-flex h-9 items-center rounded-xl bg-[#1FA971] px-3 text-sm text-white">
                      Book
                    </Link>
                  </HasPermission>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <RescheduleModal followUp={rescheduling} onClose={() => setRescheduling(null)} />
      <OutcomeModal followUp={recording} onClose={() => setRecording(null)} />
      <CreateFollowUpModal open={creating} onClose={() => setCreating(false)} doctors={doctors.data ?? []} />
    </div>
  );
};

const Metric = ({ icon, label: l, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) => (
  <Card className="p-4">
    <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">{icon}{l}</div>
    <div className="text-2xl font-semibold text-slate-900">{value}</div>
    {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
  </Card>
);

const StatusBadge = ({ f }: { f: FollowUp }) => (
  <div className="flex flex-col items-start gap-1">
    <Badge variant={STATUS_VARIANT[f.status]}>{label(f.status)}</Badge>
    {f.appointmentId && f.status === 'SCHEDULED' && <span className="text-xs text-slate-500">Appointment booked</span>}
  </div>
);

const RowActions = ({
  f,
  can,
  onReschedule,
  onRecord,
  onStatus,
}: {
  f: FollowUp;
  can: (p: string | string[]) => boolean;
  onReschedule: (f: FollowUp) => void;
  onRecord: (f: FollowUp) => void;
  onStatus: (s: FollowUpStatus) => void;
}) => {
  if (!can('follow_ups.update')) return null;
  const open = f.status === 'PENDING' || f.status === 'SCHEDULED';
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {f.status !== 'COMPLETED' && (
        <Button size="sm" variant="outline" onClick={() => onReschedule(f)}>Reschedule</Button>
      )}
      {f.status !== 'CANCELLED' && (
        <Button size="sm" onClick={() => onRecord(f)}>Record outcome</Button>
      )}
      {open && (
        <select
          aria-label="Change status"
          className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs"
          value=""
          onChange={(e) => e.target.value && onStatus(e.target.value as FollowUpStatus)}
        >
          <option value="">More…</option>
          <option value="MISSED">Mark missed</option>
          <option value="CANCELLED">Cancel</option>
        </select>
      )}
      {f.status === 'CANCELLED' && (
        <Button size="sm" variant="ghost" onClick={() => onStatus('PENDING')}>Reopen</Button>
      )}
    </div>
  );
};

const RescheduleModal = ({ followUp, onClose }: { followUp: FollowUp | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/follow-ups/${followUp!.id}`, {
        scheduledDate: dateInputToIso(date || toDateInput(followUp!.scheduledDate)),
        ...(notes ? { notes } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
      close();
    },
  });
  const close = () => {
    setDate('');
    setNotes('');
    mutation.reset();
    onClose();
  };
  const current = followUp ? toDateInput(followUp.scheduledDate) : '';
  return (
    <Modal open={!!followUp} title={`Reschedule — ${personName(followUp?.patient)}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="fu-date">New date</label>
          <input id="fu-date" type="date" className={inputCls} value={date || current} onChange={(e) => setDate(e.target.value)} required />
          {followUp?.status === 'MISSED' && <p className="text-xs text-slate-500">This missed follow-up will be re-opened.</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="fu-notes">Note (optional)</label>
          <textarea id="fu-notes" className={`${inputCls} h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
        </div>
        <ErrorBox error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending || !(date || current)}>
            {mutation.isPending ? 'Saving…' : 'Reschedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const OutcomeModal = ({ followUp, onClose }: { followUp: FollowUp | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [outcomeType, setOutcomeType] = useState<string>('IMPROVING');
  const [remarks, setRemarks] = useState('');
  const [complete, setComplete] = useState(true);
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/follow-ups/${followUp!.id}/outcomes`, {
        outcomeType,
        remarks: remarks || undefined,
        complete: complete && followUp!.status !== 'COMPLETED',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
      setRemarks('');
      onClose();
    },
  });
  return (
    <Modal open={!!followUp} title={`Outcome — ${personName(followUp?.patient)}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="fu-outcome">Outcome</label>
          <select id="fu-outcome" className={inputCls} value={outcomeType} onChange={(e) => setOutcomeType(e.target.value)}>
            {OUTCOMES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="fu-remarks">Remarks</label>
          <textarea id="fu-remarks" className={`${inputCls} h-24 py-2`} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={4000} />
        </div>
        {followUp?.status !== 'COMPLETED' && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
            Mark follow-up as completed
          </label>
        )}
        <ErrorBox error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save outcome'}</Button>
        </div>
      </form>
    </Modal>
  );
};

const CreateFollowUpModal = ({ open, onClose, doctors }: { open: boolean; onClose: () => void; doctors: Doctor[] }) => {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [date, setDate] = useState(toDateInput(new Date(Date.now() + 7 * 86400000)));
  const [reason, setReason] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const effectiveDoctor = doctorId || (doctors.some((d) => d.id === me?.id) ? me!.id : doctors[0]?.id ?? '');
  const mutation = useMutation({
    mutationFn: () =>
      api.post('/follow-ups', {
        patientId: patient!.id,
        scheduledDate: dateInputToIso(date),
        reason: reason || undefined,
        doctorId: effectiveDoctor || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
      setPatient(null);
      setReason('');
      onClose();
    },
  });
  return (
    <Modal open={open} title="Plan a follow-up" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (patient) mutation.mutate();
        }}
      >
        <PatientPicker value={patient} onChange={setPatient} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="nf-date">Due date</label>
            <input id="nf-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="nf-doctor">Doctor</label>
            <select id="nf-doctor" className={inputCls} value={effectiveDoctor} onChange={(e) => setDoctorId(e.target.value)}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>Dr. {personName(d)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="nf-reason">Reason</label>
          <input id="nf-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Review BP after medication change" />
        </div>
        <ErrorBox error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!patient || mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Plan follow-up'}</Button>
        </div>
      </form>
    </Modal>
  );
};
