import React, { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Archive, FilePlus2, Pencil, RotateCcw, Stethoscope, Pill, Trash2 } from 'lucide-react';
import { Button } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import {
  ageFrom,
  drName,
  Empty,
  ErrorBox,
  Field,
  fmtDate,
  fmtDateTime,
  fullName,
  getData,
  getPage,
  inputCls,
  Loading,
  Modal,
  qs,
  Section,
  StatusPill,
  textareaCls,
  unwrap,
} from './shared';
import { PatientSubResources } from './PatientFormPage';
import { DocumentsList, DocumentUploader } from '../documents/DocumentsPanel';

type TabKey = 'overview' | 'timeline' | 'clinical' | 'documents' | 'billing' | 'contacts';

const CATEGORY_LABEL: Record<string, string> = {
  PATIENT: 'Profile',
  APPOINTMENT: 'Appointments',
  CLINICAL: 'Clinical',
  PRESCRIPTION: 'Prescriptions',
  DOCUMENT: 'Documents',
  BILLING: 'Billing',
  COMMUNICATION: 'Messages',
  FOLLOW_UP: 'Follow-ups',
};

export const PatientProfilePage = () => {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = useCan();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-summary', id],
    queryFn: () => getData<any>(`/patients/${id}/summary`),
  });

  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', show: true },
    { key: 'timeline', label: 'Timeline', show: can('timeline.view') },
    { key: 'clinical', label: 'Clinical', show: can(['clinical.view', 'consultations.view', 'vitals.view']) },
    { key: 'documents', label: 'Documents', show: can(['documents.view', 'documents.upload']) },
    { key: 'billing', label: 'Billing', show: can('invoices.view') },
    { key: 'contacts', label: 'Contacts & family', show: true },
  ];
  const visible = tabs.filter((t) => t.show);
  const requested = (params.get('tab') as TabKey) || 'overview';
  const tab = visible.some((t) => t.key === requested) ? requested : 'overview';

  if (isLoading) return <Loading label="Loading patient…" />;
  if (error || !data) return <ErrorBox error={error ?? 'Patient not found'} />;

  const p = data.patient;
  const archived = p.status === 'ARCHIVED';
  const age = ageFrom(p.dateOfBirth);
  const refresh = () => qc.invalidateQueries({ queryKey: ['patient-summary', id] });

  const startConsultation = async () => {
    setActionError(null);
    try {
      const c = await unwrap(api.post('/consultations', { patientId: p.id }));
      navigate(`/consultations/${c.id}`);
    } catch (e) {
      setActionError(e);
    }
  };

  const archive = async () => {
    setActionError(null);
    try {
      await api.delete(`/patients/${p.id}`, { body: JSON.stringify(archiveReason ? { reason: archiveReason } : {}) });
      setArchiveOpen(false);
      refresh();
      qc.invalidateQueries({ queryKey: ['patients'] });
    } catch (e) {
      setActionError(e);
    }
  };

  const restore = async () => {
    setActionError(null);
    try {
      await api.post(`/patients/${p.id}/restore`);
      refresh();
      qc.invalidateQueries({ queryKey: ['patients'] });
    } catch (e) {
      setActionError(e);
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/patients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Patients
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1FA971]/10 text-lg font-bold text-[#1FA971]">
              {p.firstName[0]}
              {p.lastName[0]}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {fullName(p)} {archived && <StatusPill status="ARCHIVED" />}
              </h1>
              <p className="text-sm text-slate-500">
                {p.patientCode} · {p.gender ?? '—'}
                {age !== null && ` · ${age} yrs`}
                {p.bloodGroup && ` · ${p.bloodGroup}`} · {p.phone ?? 'no phone'}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.tags?.map((t: any) => (
                  <span key={t.id} className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: t.tagColor || '#64748b' }}>
                    {t.tagName}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!archived && (
              <>
                <HasPermission permission="consultations.create">
                  <Button size="sm" className="gap-1" onClick={startConsultation}>
                    <Stethoscope size={14} /> Consult
                  </Button>
                </HasPermission>
                <HasPermission permission="prescriptions.create">
                  <Link to={`/prescriptions/new${qs({ patientId: p.id })}`}>
                    <Button size="sm" variant="outline" className="gap-1">
                      <Pill size={14} /> Prescribe
                    </Button>
                  </Link>
                </HasPermission>
                <HasPermission permission="patients.update">
                  <Link to={`/patients/${p.id}/edit`}>
                    <Button size="sm" variant="outline" className="gap-1">
                      <Pencil size={14} /> Edit
                    </Button>
                  </Link>
                </HasPermission>
              </>
            )}
            <HasPermission permission="patients.delete">
              {archived ? (
                <Button size="sm" variant="outline" className="gap-1" onClick={restore}>
                  <RotateCcw size={14} /> Restore
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setArchiveOpen(true)}>
                  <Archive size={14} /> Archive
                </Button>
              )}
            </HasPermission>
          </div>
        </div>
        {data.allergies?.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Allergies: {data.allergies.map((a: any) => a.allergyName).join(', ')}
          </div>
        )}
        <ErrorBox error={actionError} className="mt-3" />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {visible.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? 'border-[#1FA971] text-[#1FA971]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab data={data} onChange={refresh} />}
      {tab === 'timeline' && <TimelineTab patientId={p.id} />}
      {tab === 'clinical' && <ClinicalTab patientId={p.id} data={data} onChange={refresh} />}
      {tab === 'documents' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <HasPermission permission="documents.upload">
            <Section title="Upload">
              <DocumentUploader
                patient={p}
                onUploaded={() => {
                  qc.invalidateQueries({ queryKey: ['documents'] });
                  refresh();
                }}
              />
            </Section>
          </HasPermission>
          <div className={can('documents.upload') ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <HasPermission permission="documents.view" fallback={<Empty title="Upload only" hint="Your role can upload but not view documents." />}>
              <DocumentsList patientId={p.id} />
            </HasPermission>
          </div>
        </div>
      )}
      {tab === 'billing' && <BillingTab data={data} />}
      {tab === 'contacts' && <ContactsTab patientId={p.id} />}

      {archiveOpen && (
        <Modal title="Archive patient" onClose={() => setArchiveOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              The record and its history are kept but hidden from lists, and no new appointments or clinical entries can be added until it is restored.
            </p>
            <Field label="Reason">
              <input className={inputCls} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setArchiveOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={archive}>
                Archive
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const OverviewTab = ({ data, onChange }: { data: any; onChange: () => void }) => {
  const can = useCan();
  const me = useAuthStore((s) => s.user);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const p = data.patient;
  const addNote = async () => {
    setErr(null);
    try {
      await api.post(`/patients/${p.id}/notes`, { note: note.trim() });
      setNote('');
      onChange();
    } catch (e) {
      setErr(e);
    }
  };
  const removeNote = async (noteId: string) => {
    setErr(null);
    try {
      await api.delete(`/patients/${p.id}/notes/${noteId}`);
      onChange();
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="At a glance">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">Last visit</dt>
          <dd>{fmtDate(data.stats?.lastVisit)}</dd>
          <dt className="text-slate-500">Visits</dt>
          <dd>{data.stats?.visitCount ?? 0}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd className="truncate">{p.email || '—'}</dd>
          <dt className="text-slate-500">DOB</dt>
          <dd>{fmtDate(p.dateOfBirth)}</dd>
          <dt className="text-slate-500">ABHA</dt>
          <dd>{p.abhaNumber || '—'}</dd>
          <dt className="text-slate-500">Messages</dt>
          <dd>{p.communicationOptIn ? `Opted in${p.preferredChannel ? ` (${p.preferredChannel})` : ''}` : 'Opted out'}</dd>
          {data.outstandingBalance !== undefined && (
            <>
              <dt className="text-slate-500">Balance due</dt>
              <dd className={Number(data.outstandingBalance) > 0 ? 'font-semibold text-red-600' : ''}>{data.outstandingBalance}</dd>
            </>
          )}
        </dl>
      </Section>

      {data.upcomingAppointments && (
        <Section title="Upcoming appointments">
          <ul className="space-y-2 text-sm">
            {data.upcomingAppointments.map((a: any) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span>{fmtDateTime(a.scheduledStart)}</span>
                <span className="text-slate-500">{drName(a.doctor)}</span>
              </li>
            ))}
            {!data.upcomingAppointments.length && <li className="text-slate-500">None scheduled</li>}
          </ul>
        </Section>
      )}

      {data.pendingFollowUps && (
        <Section title="Pending follow-ups">
          <ul className="space-y-2 text-sm">
            {data.pendingFollowUps.map((f: any) => (
              <li key={f.id} className="flex justify-between gap-2">
                <span>{fmtDate(f.scheduledDate)}</span>
                <span className="truncate text-slate-500">{f.reason || f.notes || f.status || ''}</span>
              </li>
            ))}
            {!data.pendingFollowUps.length && <li className="text-slate-500">None</li>}
          </ul>
        </Section>
      )}

      {data.activePrescriptions && (
        <Section title="Active medications">
          <ul className="space-y-1 text-sm">
            {data.activePrescriptions.flatMap((rx: any) =>
              rx.items.map((i: any) => (
                <li key={i.id}>
                  <Link to={`/prescriptions/${rx.id}`} className="font-medium hover:underline">
                    {i.medicineName}
                  </Link>{' '}
                  <span className="text-xs text-slate-500">{[i.dosage, i.frequency, i.duration].filter(Boolean).join(' · ')}</span>
                </li>
              )),
            )}
            {!data.activePrescriptions.length && <li className="text-slate-500">None</li>}
          </ul>
        </Section>
      )}

      {data.recentVitals && (
        <Section title="Latest vitals">
          {data.recentVitals[0] ? (
            <dl className="grid grid-cols-2 gap-1 text-sm">
              {(() => {
                const v = data.recentVitals[0];
                return (
                  <>
                    <dt className="text-slate-500">Recorded</dt>
                    <dd>{fmtDateTime(v.createdAt)}</dd>
                    <dt className="text-slate-500">BP</dt>
                    <dd>{v.bloodPressureSystolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic ?? '—'}` : '—'}</dd>
                    <dt className="text-slate-500">Pulse</dt>
                    <dd>{v.pulse ?? '—'}</dd>
                    <dt className="text-slate-500">SpO₂</dt>
                    <dd>{v.spo2 ?? '—'}</dd>
                    <dt className="text-slate-500">BMI</dt>
                    <dd>{v.bmi ? `${v.bmi} (${v.bmiCategory})` : '—'}</dd>
                  </>
                );
              })()}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No vitals recorded</p>
          )}
        </Section>
      )}

      {data.conditions && (
        <Section title="Conditions">
          <ul className="space-y-1 text-sm">
            {data.conditions.map((c: any) => (
              <li key={c.id}>
                {c.conditionName} <span className="text-xs text-slate-500">{c.status}</span>
              </li>
            ))}
            {!data.conditions.length && <li className="text-slate-500">None recorded</li>}
          </ul>
        </Section>
      )}

      <Section title="Notes" className="lg:col-span-3">
        <ul className="space-y-2 text-sm">
          {data.notes.map((n: any) => (
            <li key={n.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 p-2">
              <div>
                <p className="whitespace-pre-wrap">{n.note}</p>
                <p className="text-xs text-slate-500">
                  {fullName(n.author)} · {fmtDateTime(n.createdAt)}
                </p>
              </div>
              {n.createdBy === me?.id && can('patients.update') && (
                <button className="text-slate-400 hover:text-red-600" aria-label="Delete note" onClick={() => removeNote(n.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
          {!data.notes.length && <li className="text-slate-500">No notes</li>}
        </ul>
        {can('patients.update') && p.status !== 'ARCHIVED' && (
          <div className="mt-3 flex gap-2">
            <textarea className={textareaCls} rows={2} placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!note.trim()} onClick={addNote}>
              Add
            </Button>
          </div>
        )}
        <ErrorBox error={err} className="mt-2" />
      </Section>
    </div>
  );
};

const TimelineTab = ({ patientId }: { patientId: string }) => {
  const [category, setCategory] = useState('');
  const { data: categories } = useQuery({ queryKey: ['timeline-categories'], queryFn: () => getData<string[]>('/timeline/categories') });
  const query = useInfiniteQuery({
    queryKey: ['timeline', patientId, category],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getPage<any>(`/timeline${qs({ patientId, category, page: pageParam, limit: 25 })}`),
    getNextPageParam: (last) => (last.meta && last.meta.page < last.meta.pages ? last.meta.page + 1 : undefined),
  });
  const events = query.data?.pages.flatMap((pg) => pg.items) ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {['', ...(categories ?? [])].map((c) => (
          <button
            key={c || 'all'}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-xs ${category === c ? 'border-[#1FA971] bg-[#1FA971] text-white' : 'border-slate-200 bg-white text-slate-600'}`}
          >
            {c ? CATEGORY_LABEL[c] ?? c : 'All'}
          </button>
        ))}
      </div>
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : !events.length ? (
        <Empty title="No events" />
      ) : (
        <ol className="relative space-y-3 border-l border-slate-200 pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#1FA971]" />
              <p className="text-sm font-medium text-slate-900">{e.title}</p>
              {e.description && <p className="text-sm text-slate-600">{e.description}</p>}
              <p className="text-xs text-slate-400">
                {fmtDateTime(e.createdAt)} · {CATEGORY_LABEL[e.category] ?? e.category}
                {e.actor && ` · ${fullName(e.actor)}`}
              </p>
            </li>
          ))}
        </ol>
      )}
      {query.hasNextPage && (
        <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
};

const ClinicalTab = ({ patientId, data, onChange }: { patientId: string; data: any; onChange: () => void }) => {
  const can = useCan();
  const [allergy, setAllergy] = useState({ allergyName: '', severity: '', notes: '' });
  const [condition, setCondition] = useState({ conditionName: '', diagnosedDate: '', status: 'ACTIVE' });
  const [err, setErr] = useState<unknown>(null);
  const history = useQuery({
    queryKey: ['clinical-history', patientId],
    queryFn: () => getData<any>(`/clinical/patients/${patientId}/history`),
    enabled: can('clinical.view'),
  });
  const vitals = useQuery({
    queryKey: ['vitals-history', patientId],
    queryFn: () => getPage<any>(`/vitals/patient/${patientId}${qs({ limit: 20 })}`),
    enabled: can('vitals.view'),
  });
  const consultations = useQuery({
    queryKey: ['consultations', { patientId }],
    queryFn: () => getPage<any>(`/consultations${qs({ patientId, limit: 20 })}`),
    enabled: can('consultations.view'),
  });
  const run = async (fn: () => Promise<any>, reset?: () => void) => {
    setErr(null);
    try {
      await fn();
      reset?.();
      onChange();
      history.refetch();
    } catch (e) {
      setErr(e);
    }
  };
  const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
  const allergies = history.data?.allergies ?? data.allergies ?? [];
  const conditions = history.data?.conditions ?? data.conditions ?? [];

  return (
    <div className="space-y-4">
      <ErrorBox error={err} />
      {can('clinical.view') && (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Allergies">
            <ul className="space-y-1 text-sm">
              {allergies.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="text-red-700">
                    {a.allergyName} {a.severity && <span className="text-xs">({a.severity})</span>}
                    {a.notes && <span className="ml-1 text-xs text-slate-500">— {a.notes}</span>}
                  </span>
                  {can('clinical.update') && (
                    <button className="text-slate-400 hover:text-red-600" aria-label="Remove allergy" onClick={() => run(() => api.delete(`/clinical/allergies/${a.id}`))}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
              {!allergies.length && <li className="text-slate-500">No known allergies</li>}
            </ul>
            {can('clinical.update') && (
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <input className={`${inputCls} sm:col-span-2`} placeholder="Allergen" value={allergy.allergyName} onChange={(e) => setAllergy({ ...allergy, allergyName: e.target.value })} />
                <select className={inputCls} value={allergy.severity} onChange={(e) => setAllergy({ ...allergy, severity: e.target.value })} aria-label="Severity">
                  <option value="">Severity</option>
                  <option>MILD</option>
                  <option>MODERATE</option>
                  <option>SEVERE</option>
                  <option>LIFE_THREATENING</option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={allergy.allergyName.trim().length < 2}
                  onClick={() =>
                    run(() => api.post(`/clinical/patients/${patientId}/allergies`, clean(allergy)), () => setAllergy({ allergyName: '', severity: '', notes: '' }))
                  }
                >
                  Add
                </Button>
              </div>
            )}
          </Section>
          <Section title="Medical conditions">
            <ul className="space-y-1 text-sm">
              {conditions.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span>
                    {c.conditionName} <span className="text-xs text-slate-500">since {fmtDate(c.diagnosedDate)}</span>
                  </span>
                  {can('clinical.update') ? (
                    <select
                      className="h-8 rounded border border-slate-200 text-xs"
                      value={c.status ?? 'ACTIVE'}
                      onChange={(e) => run(() => api.patch(`/clinical/conditions/${c.id}`, { status: e.target.value }))}
                      aria-label="Condition status"
                    >
                      {['ACTIVE', 'CHRONIC', 'CONTROLLED', 'RESOLVED'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <StatusPill status={c.status} />
                  )}
                </li>
              ))}
              {!conditions.length && <li className="text-slate-500">None recorded</li>}
            </ul>
            {can('clinical.update') && (
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <input className={`${inputCls} sm:col-span-2`} placeholder="Condition" value={condition.conditionName} onChange={(e) => setCondition({ ...condition, conditionName: e.target.value })} />
                <input type="date" className={inputCls} value={condition.diagnosedDate} onChange={(e) => setCondition({ ...condition, diagnosedDate: e.target.value })} aria-label="Diagnosed on" />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={condition.conditionName.trim().length < 2}
                  onClick={() =>
                    run(() => api.post(`/clinical/patients/${patientId}/conditions`, clean(condition)), () =>
                      setCondition({ conditionName: '', diagnosedDate: '', status: 'ACTIVE' }),
                    )
                  }
                >
                  Add
                </Button>
              </div>
            )}
          </Section>
        </div>
      )}

      {can('vitals.view') && (
        <Section title="Vitals history">
          {vitals.isLoading ? (
            <Loading />
          ) : !vitals.data?.items.length ? (
            <p className="text-sm text-slate-500">No vitals recorded</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">BP</th>
                    <th className="py-1 pr-2">Pulse</th>
                    <th className="py-1 pr-2">Temp</th>
                    <th className="py-1 pr-2">SpO₂</th>
                    <th className="py-1 pr-2">Weight</th>
                    <th className="py-1">BMI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vitals.data.items.map((v: any) => (
                    <tr key={v.id}>
                      <td className="py-1 pr-2">{fmtDateTime(v.createdAt)}</td>
                      <td className="py-1 pr-2">{v.bloodPressureSystolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic ?? '—'}` : '—'}</td>
                      <td className="py-1 pr-2">{v.pulse ?? '—'}</td>
                      <td className="py-1 pr-2">{v.temperature ?? '—'}</td>
                      <td className="py-1 pr-2">{v.spo2 ?? '—'}</td>
                      <td className="py-1 pr-2">{v.weight ?? '—'}</td>
                      <td className="py-1">{v.bmi ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {can('consultations.view') && (
        <Section title="Consultations">
          <ul className="divide-y divide-slate-100 text-sm">
            {(consultations.data?.items ?? []).map((c: any) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/consultations/${c.id}`} className="text-[#1FA971] hover:underline">
                  {fmtDateTime(c.consultationDate)}
                </Link>
                <span className="truncate text-slate-600">{c.chiefComplaint || '—'}</span>
                <StatusPill status={c.status} />
              </li>
            ))}
            {!consultations.isLoading && !consultations.data?.items.length && <li className="py-2 text-slate-500">No consultations</li>}
          </ul>
        </Section>
      )}

      {history.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Past diagnoses">
            <ul className="space-y-1 text-sm">
              {history.data.pastDiagnoses.map((d: any) => (
                <li key={d.id}>
                  {d.icdCode && <span className="mr-1 font-mono text-xs">{d.icdCode}</span>}
                  {d.diagnosisName} <span className="text-xs text-slate-500">{fmtDate(d.date)}</span>
                </li>
              ))}
              {!history.data.pastDiagnoses.length && <li className="text-slate-500">None</li>}
            </ul>
          </Section>
          <Section title="Medication history">
            <ul className="space-y-1 text-sm">
              {history.data.medicationHistory.slice(0, 30).map((m: any, i: number) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>
                    {m.medicineName} <span className="text-xs text-slate-500">{[m.dosage, m.frequency].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {fmtDate(m.issuedAt)} <StatusPill status={m.status} />
                  </span>
                </li>
              ))}
              {!history.data.medicationHistory.length && <li className="text-slate-500">None</li>}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
};

const BillingTab = ({ data }: { data: any }) => (
  <Section
    title={`Outstanding balance: ${data.outstandingBalance ?? '0.00'}`}
    actions={
      <Link to="/billing" className="text-sm text-[#1FA971] hover:underline">
        <FilePlus2 size={14} className="mr-1 inline" /> Billing
      </Link>
    }
  >
    {!data.outstandingInvoices?.length ? (
      <p className="text-sm text-slate-500">No outstanding invoices.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1 pr-2">Invoice</th>
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1 pr-2 text-right">Total</th>
              <th className="py-1 pr-2 text-right">Paid</th>
              <th className="py-1 text-right">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.outstandingInvoices.map((i: any) => (
              <tr key={i.id}>
                <td className="py-1 pr-2">{i.invoiceNumber}</td>
                <td className="py-1 pr-2">{fmtDate(i.createdAt)}</td>
                <td className="py-1 pr-2">
                  <StatusPill status={i.status} />
                </td>
                <td className="py-1 pr-2 text-right">{i.total}</td>
                <td className="py-1 pr-2 text-right">{i.paid}</td>
                <td className="py-1 text-right font-semibold">{i.balanceDue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Section>
);

const ContactsTab = ({ patientId }: { patientId: string }) => {
  const { data, isLoading, error } = useQuery({ queryKey: ['patient', patientId], queryFn: () => getData(`/patients/${patientId}`) });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return <PatientSubResources patient={data} />;
};
