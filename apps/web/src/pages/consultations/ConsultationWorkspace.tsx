import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Lock, Plus, Save, Trash2 } from 'lucide-react';
import { Button, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useAuthStore } from '../../app/store/auth.store';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import {
  ageFrom,
  drName,
  ErrorBox,
  Field,
  fmtDate,
  fmtDateTime,
  fullName,
  getData,
  inputCls,
  Loading,
  Section,
  StatusPill,
  textareaCls,
} from '../patients/shared';
import { PrescriptionEditor } from '../prescriptions/PrescriptionEditor';
import { DocumentsList, DocumentUploader } from '../documents/DocumentsPanel';

const NOTE_FIELDS = [
  { key: 'chiefComplaint', label: 'Chief complaint', rows: 2 },
  { key: 'historyOfPresentIllness', label: 'History of present illness', rows: 3 },
  { key: 'clinicalAssessment', label: 'Clinical assessment / examination', rows: 3 },
  { key: 'treatmentPlan', label: 'Treatment plan', rows: 3 },
] as const;

const VITAL_FIELDS = [
  { key: 'height', label: 'Height (cm)', step: '0.1' },
  { key: 'weight', label: 'Weight (kg)', step: '0.1' },
  { key: 'temperature', label: 'Temp (°C)', step: '0.1' },
  { key: 'pulse', label: 'Pulse (bpm)', step: '1' },
  { key: 'respiratoryRate', label: 'Resp. rate', step: '1' },
  { key: 'bloodPressureSystolic', label: 'BP systolic', step: '1' },
  { key: 'bloodPressureDiastolic', label: 'BP diastolic', step: '1' },
  { key: 'spo2', label: 'SpO₂ (%)', step: '1' },
] as const;
const INT_VITALS = new Set(['pulse', 'respiratoryRate', 'bloodPressureSystolic', 'bloodPressureDiastolic', 'spo2']);

export const ConsultationWorkspace = () => {
  const { id } = useParams();
  const qc = useQueryClient();
  const can = useCan();
  const me = useAuthStore((s) => s.user);
  const { data: ws, isLoading, error } = useQuery({
    queryKey: ['consultation-workspace', id],
    queryFn: () => getData(`/consultations/${id}/workspace`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['consultation-workspace', id] });

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notesState, setNotesState] = useState<{ saving?: boolean; saved?: string; error?: unknown }>({});
  const [vitals, setVitals] = useState<Record<string, string>>({});
  const [vitalsError, setVitalsError] = useState<unknown>(null);
  const [dx, setDx] = useState({ icdCode: '', diagnosisName: '', severity: '' });
  const [dxError, setDxError] = useState<unknown>(null);
  const [allergy, setAllergy] = useState({ allergyName: '', severity: '' });
  const [allergyError, setAllergyError] = useState<unknown>(null);
  const [showRx, setShowRx] = useState(false);
  const [addendum, setAddendum] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);

  useEffect(() => {
    if (ws?.consultation) {
      const c = ws.consultation;
      setNotes(Object.fromEntries(NOTE_FIELDS.map((f) => [f.key, c[f.key] ?? ''])));
    }
  }, [ws?.consultation?.id, ws?.consultation?.updatedAt]);

  if (isLoading) return <Loading label="Loading workspace…" />;
  if (error || !ws) return <ErrorBox error={error ?? 'Consultation not found'} />;

  const c = ws.consultation;
  const p = ws.patient;
  const isDraft = c.status === 'DRAFT';
  const isOwner = c.doctorId === me?.id;
  const canEdit = !!ws.canEdit;
  const age = ageFrom(p?.dateOfBirth);

  const saveNotes = async () => {
    setNotesState({ saving: true });
    try {
      await api.patch(`/consultations/${c.id}`, notes);
      setNotesState({ saved: new Date().toLocaleTimeString() });
      refresh();
    } catch (e) {
      setNotesState({ error: e });
    }
  };

  const complete = async () => {
    if (!window.confirm('Complete this consultation? It will be locked; later changes need an addendum.')) return;
    setActionError(null);
    try {
      await api.patch(`/consultations/${c.id}`, notes);
      await api.post(`/consultations/${c.id}/complete`);
      refresh();
      qc.invalidateQueries({ queryKey: ['consultations'] });
    } catch (e) {
      setActionError(e);
    }
  };

  const recordVitals = async () => {
    setVitalsError(null);
    const body: Record<string, number | string> = { consultationId: c.id };
    for (const f of VITAL_FIELDS) {
      const v = vitals[f.key];
      if (v !== undefined && v !== '') body[f.key] = INT_VITALS.has(f.key) ? parseInt(v, 10) : parseFloat(v);
    }
    try {
      await api.post('/vitals', body);
      setVitals({});
      refresh();
    } catch (e) {
      setVitalsError(e);
    }
  };

  const addDiagnosis = async () => {
    setDxError(null);
    try {
      await api.post('/diagnoses', {
        consultationId: c.id,
        diagnosisName: dx.diagnosisName.trim(),
        ...(dx.icdCode.trim() ? { icdCode: dx.icdCode.trim() } : {}),
        ...(dx.severity ? { severity: dx.severity } : {}),
      });
      setDx({ icdCode: '', diagnosisName: '', severity: '' });
      refresh();
    } catch (e) {
      setDxError(e);
    }
  };

  const removeDiagnosis = async (dxId: string) => {
    setDxError(null);
    try {
      await api.delete(`/diagnoses/${dxId}`);
      refresh();
    } catch (e) {
      setDxError(e);
    }
  };

  const addAllergy = async () => {
    setAllergyError(null);
    try {
      await api.post(`/clinical/patients/${p.id}/allergies`, {
        allergyName: allergy.allergyName.trim(),
        ...(allergy.severity ? { severity: allergy.severity } : {}),
      });
      setAllergy({ allergyName: '', severity: '' });
      refresh();
    } catch (e) {
      setAllergyError(e);
    }
  };

  const addAddendum = async () => {
    setActionError(null);
    try {
      await api.post(`/consultations/${c.id}/addendum`, { note: addendum.trim() });
      setAddendum('');
      refresh();
    } catch (e) {
      setActionError(e);
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/consultations" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Consultations
      </Link>
      <PageHeader
        title={fullName(p)}
        description={`${p.patientCode ?? ''} · ${p.gender ?? '—'}${age !== null ? ` · ${age} yrs` : ''}${p.bloodGroup ? ` · ${p.bloodGroup}` : ''} · ${drName(c.doctor)} · ${fmtDateTime(c.consultationDate)}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={c.status} />
        {!isDraft && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Lock size={12} /> Locked — edits are recorded as addenda
          </span>
        )}
        {isDraft && !isOwner && <span className="text-xs text-slate-500">Read-only: only the consulting doctor can edit</span>}
        <div className="ml-auto flex gap-2">
          <Link to={`/patients/${p.id}`}>
            <Button variant="outline" size="sm">
              Patient profile
            </Button>
          </Link>
          {canEdit && can('consultations.update') && (
            <Button size="sm" className="gap-1" onClick={complete}>
              <CheckCircle2 size={14} /> Complete consultation
            </Button>
          )}
        </div>
      </div>
      <ErrorBox error={actionError} />

      {ws.allergies?.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>Allergies:</strong> {ws.allergies.map((a: any) => `${a.allergyName}${a.severity ? ` (${a.severity})` : ''}`).join(', ')}
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section
            title="Clinical notes"
            actions={
              canEdit && (
                <Button size="sm" variant="outline" className="gap-1" onClick={saveNotes} disabled={notesState.saving}>
                  <Save size={14} /> {notesState.saving ? 'Saving…' : 'Save'}
                </Button>
              )
            }
          >
            <div className="space-y-3">
              {NOTE_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <textarea
                    className={textareaCls}
                    rows={f.rows}
                    disabled={!canEdit}
                    value={notes[f.key] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [f.key]: e.target.value })}
                  />
                </Field>
              ))}
              {notesState.saved && <p className="text-xs text-emerald-700">Saved at {notesState.saved}</p>}
              <ErrorBox error={notesState.error} />
            </div>
          </Section>

          {ws.vitals !== undefined && (
            <Section title="Vitals">
              {ws.vitals.length > 0 && (
                <div className="mb-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-1 pr-2">Time</th>
                        <th className="py-1 pr-2">BP</th>
                        <th className="py-1 pr-2">Pulse</th>
                        <th className="py-1 pr-2">Temp</th>
                        <th className="py-1 pr-2">SpO₂</th>
                        <th className="py-1 pr-2">Wt / Ht</th>
                        <th className="py-1">BMI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ws.vitals.map((v: any) => (
                        <tr key={v.id}>
                          <td className="py-1 pr-2">{fmtDateTime(v.createdAt)}</td>
                          <td className="py-1 pr-2">{v.bloodPressureSystolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic ?? '—'}` : '—'}</td>
                          <td className="py-1 pr-2">{v.pulse ?? '—'}</td>
                          <td className="py-1 pr-2">{v.temperature ?? '—'}</td>
                          <td className="py-1 pr-2">{v.spo2 ?? '—'}</td>
                          <td className="py-1 pr-2">
                            {v.weight ?? '—'} / {v.height ?? '—'}
                          </td>
                          <td className="py-1">{v.bmi ? `${v.bmi} (${v.bmiCategory})` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {isDraft && can('vitals.create') ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {VITAL_FIELDS.map((f) => (
                      <Field key={f.key} label={f.label}>
                        <input
                          type="number"
                          step={f.step}
                          className={inputCls}
                          value={vitals[f.key] ?? ''}
                          onChange={(e) => setVitals({ ...vitals, [f.key]: e.target.value })}
                        />
                      </Field>
                    ))}
                  </div>
                  <ErrorBox error={vitalsError} className="mt-2" />
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="outline" onClick={recordVitals} disabled={!Object.values(vitals).some(Boolean)}>
                      Record vitals
                    </Button>
                  </div>
                </>
              ) : (
                !ws.vitals.length && <p className="text-sm text-slate-500">No vitals recorded.</p>
              )}
            </Section>
          )}

          {ws.diagnoses !== undefined && (
            <Section title="Diagnoses">
              <ul className="space-y-2">
                {ws.diagnoses.map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm">
                    <span>
                      {d.icdCode && <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs">{d.icdCode}</span>}
                      <span className="font-medium">{d.diagnosisName}</span>
                      {d.severity && <span className="ml-2 text-xs text-slate-500">{d.severity}</span>}
                    </span>
                    {canEdit && can('diagnoses.create') && (
                      <button className="text-slate-400 hover:text-red-600" aria-label="Remove diagnosis" onClick={() => removeDiagnosis(d.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
                {!ws.diagnoses.length && <li className="text-sm text-slate-500">No diagnoses yet.</li>}
              </ul>
              {canEdit && can('diagnoses.create') && (
                <div className="mt-3 grid gap-2 sm:grid-cols-6">
                  <input className={`${inputCls} sm:col-span-1`} placeholder="ICD (J06.9)" value={dx.icdCode} onChange={(e) => setDx({ ...dx, icdCode: e.target.value })} />
                  <input className={`${inputCls} sm:col-span-3`} placeholder="Diagnosis" value={dx.diagnosisName} onChange={(e) => setDx({ ...dx, diagnosisName: e.target.value })} />
                  <select className={inputCls} value={dx.severity} onChange={(e) => setDx({ ...dx, severity: e.target.value })} aria-label="Severity">
                    <option value="">Severity</option>
                    <option>MILD</option>
                    <option>MODERATE</option>
                    <option>SEVERE</option>
                  </select>
                  <Button size="sm" variant="outline" className="gap-1" disabled={dx.diagnosisName.trim().length < 2} onClick={addDiagnosis}>
                    <Plus size={14} /> Add
                  </Button>
                </div>
              )}
              <ErrorBox error={dxError} className="mt-2" />
            </Section>
          )}

          {ws.prescriptions !== undefined && (
            <Section
              title="Prescriptions"
              actions={
                canEdit &&
                can('prescriptions.create') &&
                !showRx && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowRx(true)}>
                    <Plus size={14} /> Prescribe
                  </Button>
                )
              }
            >
              {showRx && (
                <div className="mb-4 rounded-lg border border-slate-200 p-3">
                  <PrescriptionEditor
                    patient={p}
                    consultationId={c.id}
                    onSaved={() => {
                      setShowRx(false);
                      refresh();
                    }}
                    onCancel={() => setShowRx(false)}
                  />
                </div>
              )}
              <ul className="space-y-2">
                {ws.prescriptions.map((rx: any) => (
                  <li key={rx.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <Link to={`/prescriptions/${rx.id}`} className="font-medium text-[#1FA971] hover:underline">
                        {fmtDateTime(rx.issuedAt)}
                      </Link>
                      <StatusPill status={rx.status} />
                    </div>
                    <p className="text-slate-600">
                      {rx.items.map((i: any) => [i.medicineName, i.dosage, i.frequency, i.duration].filter(Boolean).join(' · ')).join(' | ')}
                    </p>
                  </li>
                ))}
                {!ws.prescriptions.length && !showRx && <li className="text-sm text-slate-500">No prescriptions for this consultation.</li>}
              </ul>
            </Section>
          )}

          <HasPermission permission={['documents.view', 'documents.upload']}>
            <Section title="Reports & documents">
              <HasPermission permission="documents.upload">
                <div className="mb-4">
                  <DocumentUploader patient={p} consultationId={c.id} onUploaded={() => qc.invalidateQueries({ queryKey: ['documents'] })} />
                </div>
              </HasPermission>
              <HasPermission permission="documents.view">
                <DocumentsList patientId={p.id} consultationId={c.id} compact />
              </HasPermission>
            </Section>
          </HasPermission>

          {!isDraft && (
            <Section title="Addenda">
              <ul className="space-y-2">
                {ws.addenda.map((a: any) => (
                  <li key={a.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                    <p className="whitespace-pre-wrap">{a.note}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {drName(a.author)} · {fmtDateTime(a.createdAt)}
                    </p>
                  </li>
                ))}
                {!ws.addenda.length && <li className="text-sm text-slate-500">No addenda.</li>}
              </ul>
              {isOwner && can('consultations.update') && (
                <div className="mt-3 space-y-2">
                  <textarea className={textareaCls} rows={2} placeholder="Add an addendum (e.g. lab results reviewed)…" value={addendum} onChange={(e) => setAddendum(e.target.value)} />
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" disabled={addendum.trim().length < 3} onClick={addAddendum}>
                      Add addendum
                    </Button>
                  </div>
                </div>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-4">
          {ws.allergies !== undefined && (
            <Section title="Allergies">
              <ul className="space-y-1 text-sm">
                {ws.allergies.map((a: any) => (
                  <li key={a.id} className="text-red-700">
                    {a.allergyName} {a.severity && <span className="text-xs">({a.severity})</span>}
                  </li>
                ))}
                {!ws.allergies.length && <li className="text-slate-500">No known allergies recorded</li>}
              </ul>
              {can('clinical.update') && (
                <div className="mt-3 flex gap-2">
                  <input className={inputCls} placeholder="Add allergy" value={allergy.allergyName} onChange={(e) => setAllergy({ ...allergy, allergyName: e.target.value })} />
                  <select className={`${inputCls} w-28`} value={allergy.severity} onChange={(e) => setAllergy({ ...allergy, severity: e.target.value })} aria-label="Allergy severity">
                    <option value="">Sev.</option>
                    <option>MILD</option>
                    <option>MODERATE</option>
                    <option>SEVERE</option>
                    <option>LIFE_THREATENING</option>
                  </select>
                  <Button size="sm" variant="outline" disabled={allergy.allergyName.trim().length < 2} onClick={addAllergy}>
                    Add
                  </Button>
                </div>
              )}
              <ErrorBox error={allergyError} className="mt-2" />
            </Section>
          )}
          {ws.conditions !== undefined && (
            <Section title="Medical conditions">
              <ul className="space-y-1 text-sm">
                {ws.conditions.map((m: any) => (
                  <li key={m.id}>
                    {m.conditionName} <span className="text-xs text-slate-500">{m.status}</span>
                  </li>
                ))}
                {!ws.conditions.length && <li className="text-slate-500">None recorded</li>}
              </ul>
            </Section>
          )}
          {ws.activeMedications !== undefined && (
            <Section title="Active medications">
              <ul className="space-y-1 text-sm">
                {ws.activeMedications.map((m: any) => (
                  <li key={m.id}>
                    <span className="font-medium">{m.medicineName}</span>{' '}
                    <span className="text-xs text-slate-500">{[m.dosage, m.frequency].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
                {!ws.activeMedications.length && <li className="text-slate-500">None</li>}
              </ul>
            </Section>
          )}
          <Section title="Previous visits">
            <ul className="space-y-2 text-sm">
              {ws.previousConsultations.map((pc: any) => (
                <li key={pc.id}>
                  <Link to={`/consultations/${pc.id}`} className="font-medium text-[#1FA971] hover:underline">
                    {fmtDate(pc.consultationDate)}
                  </Link>{' '}
                  <span className="text-xs text-slate-500">{drName(pc.doctor)}</span>
                  <p className="text-slate-600">{pc.chiefComplaint || '—'}</p>
                  {pc.diagnoses?.length > 0 && <p className="text-xs text-slate-500">{pc.diagnoses.map((d: any) => d.diagnosisName).join(', ')}</p>}
                </li>
              ))}
              {!ws.previousConsultations.length && <li className="text-slate-500">First visit</li>}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
};
