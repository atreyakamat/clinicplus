import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Monitor, ArrowUp, ArrowDown, UserPlus, X, Siren, DoorOpen } from 'lucide-react';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { type Appointment, type Doctor, errorMessage, fmtTime, inputCls, statusLabel, unwrap, unwrapPage, ymd } from '../doctors/scheduling';

type Priority = 'NORMAL' | 'HIGH' | 'EMERGENCY';
interface Entry {
  id: string;
  tokenNumber: number;
  status: 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priorityLevel: Priority;
  room?: string | null;
  checkInTime?: string | null;
  calledTime?: string | null;
  appointment: {
    id: string;
    status: string;
    scheduledStart: string;
    appointmentType?: string | null;
    patient: { id: string; firstName: string; lastName: string; phone?: string | null };
    doctor: { id: string; firstName: string; lastName: string };
  };
}
interface LiveQueue { id: string | null; date: string; timezone: string; entries: Entry[]; completed: Entry[] }

const PRIORITY_STYLE: Record<Priority, string> = {
  EMERGENCY: 'bg-red-600 text-white',
  HIGH: 'bg-amber-100 text-amber-800',
  NORMAL: 'bg-slate-100 text-slate-600',
};

export const QueuePage = () => {
  const [params] = useSearchParams();
  if (params.get('display') === 'tv') return <TvDisplay />;
  return <QueueBoard />;
};

const QueueBoard = () => {
  const qc = useQueryClient();
  const can = useCan();
  const [room, setRoom] = useState(() => { try { return localStorage.getItem('queue.room') ?? ''; } catch { return ''; } });
  const [doctorFilter, setDoctorFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  useEffect(() => { try { localStorage.setItem('queue.room', room); } catch { /* ignore */ } }, [room]);

  const { data: queue, isLoading, error: loadError } = useQuery<LiveQueue>({
    queryKey: ['queue', 'live'],
    queryFn: async () => unwrap<LiveQueue>(await api.get('/queues/live')),
    refetchInterval: 5000,
  });
  const { data: doctors } = useQuery<Doctor[]>({
    queryKey: ['doctors', ''],
    enabled: can('doctors.view'),
    queryFn: async () => unwrap<Doctor[]>(await api.get('/doctors')),
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['queue'] }); qc.invalidateQueries({ queryKey: ['appointments'] }); };
  const onError = (e: unknown) => setError(errorMessage(e));
  const onSuccess = () => { setError(null); refresh(); };

  const callNext = useMutation({ mutationFn: () => api.post('/queues/call-next', { room: room || undefined, doctorId: doctorFilter || undefined }), onSuccess, onError });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/queues/entries/${id}/status`, { status }), onSuccess, onError });
  const patchEntry = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/queues/entries/${id}`, body), onSuccess, onError });
  const reorder = useMutation({ mutationFn: (entryIds: string[]) => api.put('/queues/reorder', { entryIds }), onSuccess, onError });

  const entries = (queue?.entries ?? []).filter((e) => !doctorFilter || e.appointment.doctor.id === doctorFilter);
  const waiting = entries.filter((e) => e.status === 'WAITING');
  const active = entries.filter((e) => e.status !== 'WAITING');
  const editable = can('queues.update');

  const move = (id: string, dir: -1 | 1) => {
    const all = (queue?.entries ?? []).filter((e) => e.status === 'WAITING').map((e) => e.id);
    const i = all.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    reorder.mutate(all);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Queue"
        description={queue ? `Today's queue · ${queue.date}` : 'Live patient flow'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => window.open('/queue?display=tv', 'clinic-queue-tv', 'noopener')}><Monitor size={16} /> TV display</Button>
            {editable && can('appointments.create') && <Button variant="outline" className="gap-2" onClick={() => setWalkIn(true)}><UserPlus size={16} /> Walk-in</Button>}
          </div>
        }
      />

      {editable && (
        <Card className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600 flex flex-col gap-1">Your room<input className={`${inputCls} w-36`} placeholder="e.g. Room 2" value={room} onChange={(e) => setRoom(e.target.value)} /></label>
          {doctors && (
            <label className="text-xs text-slate-600 flex flex-col gap-1">Doctor
              <select className={`${inputCls} w-52`} value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
                <option value="">All doctors</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>)}
              </select>
            </label>
          )}
          <Button className="gap-2" onClick={() => callNext.mutate()} disabled={callNext.isPending || waiting.length === 0}><Megaphone size={16} /> Call next</Button>
          <span className="text-sm text-slate-500">{waiting.length} waiting · {active.length} with doctor</span>
        </Card>
      )}

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 flex justify-between">{error}<button onClick={() => setError(null)}><X size={14} /></button></div>}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">{[1, 2].map((i) => <div key={i} className="h-64 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : loadError ? (
        <div className="p-6 rounded-xl bg-red-50 text-red-700">{errorMessage(loadError, 'Failed to load the queue')}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Column title="Waiting" count={waiting.length}>
            {waiting.length === 0 && <Empty text="No one is waiting." />}
            {waiting.map((e, idx) => (
              <EntryCard key={e.id} e={e}>
                {editable && (
                  <>
                    <Button size="sm" onClick={() => setStatus.mutate({ id: e.id, status: 'CALLED' })}>Call</Button>
                    <select className="h-9 rounded-lg border border-slate-200 text-xs px-2" value={e.priorityLevel} onChange={(ev) => patchEntry.mutate({ id: e.id, body: { priority: ev.target.value } })}>
                      <option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="EMERGENCY">Emergency</option>
                    </select>
                    <button className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30" disabled={idx === 0} onClick={() => move(e.id, -1)} title="Move up"><ArrowUp size={16} /></button>
                    <button className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30" disabled={idx === waiting.length - 1} onClick={() => move(e.id, 1)} title="Move down"><ArrowDown size={16} /></button>
                    <RoomButton e={e} onSave={(r) => patchEntry.mutate({ id: e.id, body: { room: r } })} />
                    <button className="text-xs text-red-600 ml-auto" onClick={() => confirm('Remove from queue?') && setStatus.mutate({ id: e.id, status: 'CANCELLED' })}>Remove</button>
                  </>
                )}
              </EntryCard>
            ))}
          </Column>
          <Column title="Called / in consultation" count={active.length}>
            {active.length === 0 && <Empty text="No patient is with a doctor." />}
            {active.map((e) => (
              <EntryCard key={e.id} e={e}>
                {editable && (
                  <>
                    {e.status === 'CALLED' && <Button size="sm" onClick={() => setStatus.mutate({ id: e.id, status: 'IN_PROGRESS' })}>Start</Button>}
                    {e.status === 'CALLED' && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: e.id, status: 'WAITING' })}>Back to waiting</Button>}
                    {e.status === 'IN_PROGRESS' && <Button size="sm" onClick={() => setStatus.mutate({ id: e.id, status: 'COMPLETED' })}>Complete</Button>}
                    <RoomButton e={e} onSave={(r) => patchEntry.mutate({ id: e.id, body: { room: r } })} />
                    <button className="text-xs text-red-600 ml-auto" onClick={() => confirm('Remove from queue?') && setStatus.mutate({ id: e.id, status: 'CANCELLED' })}>Remove</button>
                  </>
                )}
              </EntryCard>
            ))}
          </Column>
        </div>
      )}

      <HasPermission permission={['appointments.view']}>
        {editable && <TodayArrivals timezone={queue?.timezone} />}
      </HasPermission>

      {queue && queue.completed.length > 0 && (
        <Card>
          <h3 className="font-semibold text-sm mb-2">Done today</h3>
          <div className="flex flex-wrap gap-2">
            {queue.completed.map((e) => (
              <span key={e.id} className={`text-xs px-2 py-1 rounded ${e.status === 'COMPLETED' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500 line-through'}`}>#{e.tokenNumber} {e.appointment.patient.firstName}</span>
            ))}
          </div>
        </Card>
      )}

      {walkIn && <WalkInDialog doctors={doctors ?? []} onClose={() => setWalkIn(false)} onDone={() => { setWalkIn(false); refresh(); }} />}
    </div>
  );
};

const Column = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => (
  <div className="rounded-xl bg-slate-100/70 p-3 space-y-2">
    <div className="flex items-center justify-between px-1"><h3 className="font-semibold text-slate-800">{title}</h3><span className="text-xs bg-white rounded-full px-2 py-0.5">{count}</span></div>
    {children}
  </div>
);
const Empty = ({ text }: { text: string }) => <p className="text-sm text-slate-400 text-center py-8">{text}</p>;

const EntryCard = ({ e, children }: { e: Entry; children?: React.ReactNode }) => (
  <div className={`rounded-lg bg-white border p-3 ${e.priorityLevel === 'EMERGENCY' ? 'border-red-400' : 'border-slate-200'}`}>
    <div className="flex items-start gap-3">
      <div className="text-2xl font-bold text-[#1FA971] w-12 shrink-0">#{e.tokenNumber}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">{e.appointment.patient.firstName} {e.appointment.patient.lastName}</span>
          {e.priorityLevel !== 'NORMAL' && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIORITY_STYLE[e.priorityLevel]}`}>{e.priorityLevel === 'EMERGENCY' && <Siren size={10} className="inline mr-0.5" />}{e.priorityLevel}</span>}
          {e.status !== 'WAITING' && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{statusLabel(e.status)}</span>}
        </div>
        <div className="text-xs text-slate-500">
          Dr. {e.appointment.doctor.firstName} {e.appointment.doctor.lastName} · booked {fmtTime(e.appointment.scheduledStart)}
          {e.checkInTime && ` · arrived ${fmtTime(e.checkInTime)}`}
          {e.room && <> · <DoorOpen size={11} className="inline" /> {e.room}</>}
        </div>
      </div>
    </div>
    {children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

const RoomButton = ({ e, onSave }: { e: Entry; onSave: (room: string) => void }) => (
  <button className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1" onClick={() => { const r = prompt('Room', e.room ?? ''); if (r !== null) onSave(r.trim()); }}>
    <DoorOpen size={14} /> {e.room ? 'Change room' : 'Assign room'}
  </button>
);

/** Today's booked patients not yet checked in. */
const TodayArrivals = ({ timezone }: { timezone?: string }) => {
  const qc = useQueryClient();
  const today = ymd(new Date(), timezone);
  const { data } = useQuery({
    queryKey: ['appointments', 'arrivals', today],
    queryFn: async () => unwrapPage<Appointment>(await api.get(`/appointments?date=${today}&status=SCHEDULED,CONFIRMED&limit=200`)).items,
    refetchInterval: 15000,
  });
  const [priority, setPriority] = useState<Record<string, Priority>>({});
  const checkIn = useMutation({
    mutationFn: (a: Appointment) => api.post('/queues/check-in', { appointmentId: a.id, priority: priority[a.id] ?? 'NORMAL' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['queue'] }); qc.invalidateQueries({ queryKey: ['appointments'] }); },
    onError: (e) => alert(errorMessage(e)),
  });
  if (!data?.length) return null;
  return (
    <Card>
      <h3 className="font-semibold text-sm mb-3">Expected today — not yet arrived ({data.length})</h3>
      <div className="divide-y divide-slate-100">
        {data.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="text-sm"><span className="font-medium">{fmtTime(a.scheduledStart, timezone)}</span> · {a.patient?.firstName} {a.patient?.lastName} <span className="text-slate-500">· Dr. {a.doctor?.lastName}</span></div>
            <div className="flex items-center gap-2">
              <select className="h-9 rounded-lg border border-slate-200 text-xs px-2" value={priority[a.id] ?? 'NORMAL'} onChange={(e) => setPriority({ ...priority, [a.id]: e.target.value as Priority })}>
                <option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="EMERGENCY">Emergency</option>
              </select>
              <Button size="sm" onClick={() => checkIn.mutate(a)} disabled={checkIn.isPending}>Check in</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const WalkInDialog = ({ doctors, onClose, onDone }: { doctors: Doctor[]; onClose: () => void; onDone: () => void }) => {
  const [q, setQ] = useState('');
  const [patient, setPatient] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [room, setRoom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: results } = useQuery({
    queryKey: ['patients', 'walkin', q],
    enabled: q.trim().length >= 2,
    queryFn: async () => unwrapPage<{ id: string; firstName: string; lastName: string; phone?: string }>(await api.get(`/patients?q=${encodeURIComponent(q.trim())}&limit=6`)).items,
  });
  const save = useMutation({
    mutationFn: () => api.post('/queues/walk-in', { patientId: patient!.id, doctorId, priority, room: room || undefined }),
    onSuccess: onDone,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center"><h2 className="text-lg font-semibold">Walk-in / emergency</h2><button onClick={onClose}><X size={18} /></button></div>
        {patient ? (
          <div className="flex justify-between items-center rounded bg-slate-50 p-2 text-sm"><span className="font-medium">{patient.firstName} {patient.lastName}</span><button className="text-xs" onClick={() => setPatient(null)}>Change</button></div>
        ) : (
          <div>
            <input autoFocus className={inputCls} placeholder="Search patient (name / phone)" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-1">{results?.map((p) => <button key={p.id} className="block w-full text-left text-sm px-2 py-1.5 hover:bg-slate-50 rounded" onClick={() => setPatient(p)}>{p.firstName} {p.lastName} <span className="text-xs text-slate-500">{p.phone}</span></button>)}</div>
            {results && results.length === 0 && <p className="text-xs text-slate-500 mt-1">No match — register the patient first.</p>}
          </div>
        )}
        <select className={inputCls} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">Select doctor</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="EMERGENCY">Emergency</option>
          </select>
          <input className={inputCls} placeholder="Room (optional)" value={room} onChange={(e) => setRoom(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!patient || !doctorId || save.isPending} onClick={() => save.mutate()}>Add to queue</Button></div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------- TV display
interface DisplayEntry { token: number; status: string; room?: string | null; priorityLevel: Priority; patient: string; doctor: string }
interface DisplayData { clinic: string; logoUrl?: string | null; branch: string; date: string; nowServing: DisplayEntry[]; waiting: DisplayEntry[]; updatedAt: string }

/** Full-screen, read-only waiting-room display. Polls every 5 seconds. */
const TvDisplay = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const { data, error, dataUpdatedAt } = useQuery<DisplayData>({
    queryKey: ['queue', 'display'],
    queryFn: async () => unwrap<DisplayData>(await api.get('/queues/display')),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
  const stale = dataUpdatedAt && now.getTime() - dataUpdatedAt > 30000;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0B0F14] text-white flex flex-col p-6 md:p-10 overflow-hidden">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {data?.logoUrl && <img src={data.logoUrl} alt="" className="h-14 w-14 object-contain rounded bg-white p-1" />}
          <div className="min-w-0">
            <h1 className="text-3xl md:text-5xl font-bold truncate">{data?.clinic ?? 'Clinic'}</h1>
            <p className="text-lg md:text-2xl text-gray-400 truncate">{data?.branch}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl md:text-5xl font-mono font-bold">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="text-gray-400">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
      </header>

      {error && <p className="mt-4 text-red-400">{errorMessage(error, 'Display offline')}</p>}
      {stale && <p className="mt-4 text-amber-400">Reconnecting…</p>}

      <div className="flex-1 grid gap-6 md:grid-cols-[3fr_2fr] mt-8 min-h-0">
        <section className="rounded-2xl bg-[#1F2937] p-6 flex flex-col min-h-0">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#1FA971] mb-4">Now serving</h2>
          <div className="space-y-4 overflow-hidden">
            {!data?.nowServing.length && <p className="text-2xl text-gray-500">Please wait to be called</p>}
            {data?.nowServing.map((e) => (
              <div key={e.token} className={`flex items-center justify-between rounded-xl px-6 py-4 ${e.status === 'CALLED' ? 'bg-[#1FA971] animate-pulse' : 'bg-gray-800'}`}>
                <div className="text-5xl md:text-7xl font-black font-mono">{e.token}</div>
                <div className="text-right">
                  <div className="text-2xl md:text-4xl font-bold">{e.room || '—'}</div>
                  <div className="text-lg md:text-xl opacity-80">{e.patient} · {e.doctor}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl bg-[#1F2937] p-6 flex flex-col min-h-0">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">Next ({data?.waiting.length ?? 0})</h2>
          <div className="grid grid-cols-3 gap-3 content-start overflow-hidden">
            {data?.waiting.slice(0, 18).map((e) => (
              <div key={e.token} className={`rounded-lg text-center py-3 text-3xl md:text-4xl font-bold font-mono ${e.priorityLevel === 'EMERGENCY' ? 'bg-red-700' : 'bg-gray-800'}`}>{e.token}</div>
            ))}
          </div>
        </section>
      </div>
      <footer className="mt-4 text-sm text-gray-500 flex justify-between">
        <span>Please keep your token number ready.</span>
        <a href="/queue" className="text-gray-600 hover:text-gray-400">Exit display</a>
      </footer>
    </div>
  );
};
