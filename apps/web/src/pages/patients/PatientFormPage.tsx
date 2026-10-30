import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button, PageHeader } from '@clinicplus/ui';
import { api, ApiError } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';
import {
  ErrorBox,
  Field,
  fullName,
  getData,
  inputCls,
  Loading,
  PatientPicker,
  qs,
  Section,
  unwrap,
  type PatientHit,
} from './shared';

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL', 'CALL'];

type Demo = Record<string, string | boolean>;

const emptyDemo: Demo = {
  firstName: '',
  middleName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  phone: '',
  email: '',
  bloodGroup: '',
  maritalStatus: '',
  occupation: '',
  abhaNumber: '',
  preferredChannel: '',
  communicationOptIn: true,
};

/** Strips empty strings so optional fields validate server-side. */
function clean(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v !== undefined) out[k] = v;
  return out;
}

export const PatientFormPage = () => {
  const { id } = useParams();
  const isEditing = !!id && id !== 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<Demo>(emptyDemo);
  const [address, setAddress] = useState({ addressLine1: '', city: '', state: '', postalCode: '' });
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '' });
  const [tags, setTags] = useState('');
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => getData(`/patients/${id}`),
    enabled: isEditing,
  });

  useEffect(() => {
    if (patient) {
      const next: Demo = { ...emptyDemo };
      for (const k of Object.keys(emptyDemo)) {
        const v = (patient as any)[k];
        if (v !== null && v !== undefined) next[k] = k === 'dateOfBirth' ? String(v).slice(0, 10) : v;
      }
      setForm(next);
    }
  }, [patient]);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  // Live duplicate hint on phone (create only).
  const checkDuplicates = async () => {
    if (isEditing || !form.phone) return;
    try {
      const hits = await getData<any[]>(`/patients/duplicates${qs({ phone: String(form.phone) })}`);
      setDupWarning(
        hits?.length
          ? `${hits.length} existing patient(s) share this phone: ${hits.map((h) => `${fullName(h)} (${h.patientCode})`).join(', ')}`
          : null,
      );
    } catch {
      /* hint only */
    }
  };

  const save = useMutation({
    mutationFn: async (allowDuplicate: boolean) => {
      const body: Record<string, any> = clean({ ...form });
      if (!isEditing) {
        if (allowDuplicate) body.allowDuplicate = true;
        if (Object.values(address).some(Boolean)) body.addresses = [clean({ addressType: 'HOME', ...address })];
        if (contact.name) body.emergencyContacts = [clean(contact)];
        const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
        if (tagList.length) body.tags = tagList.map((tagName) => ({ tagName }));
        return unwrap(api.post('/patients', body));
      }
      return unwrap(api.patch(`/patients/${id}`, body));
    },
    onSuccess: (p: any) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['patient', p.id] });
      qc.invalidateQueries({ queryKey: ['patient-summary', p.id] });
      navigate(`/patients/${p.id}`);
    },
    onError: (e) => {
      setError(e);
      if (e instanceof ApiError && e.status === 409 && /duplicate/i.test(e.data?.message ?? '')) setDupWarning(e.data.message);
    },
  });

  const submit = (e: React.FormEvent, allowDuplicate = false) => {
    e.preventDefault();
    setError(null);
    save.mutate(allowDuplicate);
  };

  if (isEditing && isLoading) return <Loading label="Loading patient…" />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to={isEditing ? `/patients/${id}` : '/patients'} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Back
      </Link>
      <PageHeader
        title={isEditing ? `Edit ${fullName(patient as any)}` : 'Register patient'}
        description={isEditing ? (patient as any)?.patientCode : 'A patient ID is generated automatically.'}
      />

      <form onSubmit={(e) => submit(e)} className="space-y-4">
        <Section title="Demographics">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="First name *">
              <input className={inputCls} required value={String(form.firstName)} onChange={(e) => set('firstName', e.target.value)} />
            </Field>
            <Field label="Middle name">
              <input className={inputCls} value={String(form.middleName)} onChange={(e) => set('middleName', e.target.value)} />
            </Field>
            <Field label="Last name *">
              <input className={inputCls} required value={String(form.lastName)} onChange={(e) => set('lastName', e.target.value)} />
            </Field>
            <Field label="Gender">
              <select className={inputCls} value={String(form.gender)} onChange={(e) => set('gender', e.target.value)}>
                <option value="">—</option>
                {GENDERS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                className={inputCls}
                max={new Date().toISOString().slice(0, 10)}
                value={String(form.dateOfBirth)}
                onChange={(e) => set('dateOfBirth', e.target.value)}
              />
            </Field>
            <Field label="Blood group">
              <select className={inputCls} value={String(form.bloodGroup)} onChange={(e) => set('bloodGroup', e.target.value)}>
                <option value="">—</option>
                {BLOOD.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Phone">
              <input
                className={inputCls}
                inputMode="tel"
                value={String(form.phone)}
                onChange={(e) => set('phone', e.target.value)}
                onBlur={checkDuplicates}
              />
            </Field>
            <Field label="Email">
              <input type="email" className={inputCls} value={String(form.email)} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Preferred channel">
              <select className={inputCls} value={String(form.preferredChannel)} onChange={(e) => set('preferredChannel', e.target.value)}>
                <option value="">—</option>
                {CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Marital status">
              <input className={inputCls} value={String(form.maritalStatus)} onChange={(e) => set('maritalStatus', e.target.value)} />
            </Field>
            <Field label="Occupation">
              <input className={inputCls} value={String(form.occupation)} onChange={(e) => set('occupation', e.target.value)} />
            </Field>
            <Field label="ABHA number">
              <input className={inputCls} value={String(form.abhaNumber)} onChange={(e) => set('abhaNumber', e.target.value)} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={!!form.communicationOptIn} onChange={(e) => set('communicationOptIn', e.target.checked)} />
            Patient agrees to receive reminders and messages
          </label>
        </Section>

        {!isEditing && (
          <>
            <Section title="Address">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Address" className="sm:col-span-2">
                  <input className={inputCls} value={address.addressLine1} onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })} />
                </Field>
                <Field label="City">
                  <input className={inputCls} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
                </Field>
                <Field label="PIN / ZIP">
                  <input className={inputCls} value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} />
                </Field>
              </div>
            </Section>
            <Section title="Emergency contact & tags">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Contact name">
                  <input className={inputCls} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                </Field>
                <Field label="Relationship">
                  <input className={inputCls} value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} />
                </Field>
                <Field label="Contact phone">
                  <input className={inputCls} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                </Field>
                <Field label="Tags (comma separated)">
                  <input className={inputCls} placeholder="VIP, Diabetic" value={tags} onChange={(e) => setTags(e.target.value)} />
                </Field>
              </div>
            </Section>
          </>
        )}

        {dupWarning && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {dupWarning}
            </span>
            {!isEditing && error instanceof ApiError && error.status === 409 && /allowDuplicate/.test(error.data?.message ?? '') && (
              <Button type="button" size="sm" variant="outline" onClick={(e) => submit(e as any, true)} disabled={save.isPending}>
                Register anyway
              </Button>
            )}
          </div>
        )}
        {!(error instanceof ApiError && error.status === 409) && <ErrorBox error={error} />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Register patient'}
          </Button>
        </div>
      </form>

      {isEditing && patient && <PatientSubResources patient={patient} />}
    </div>
  );
};

/** Addresses, emergency contacts, tags and family links of an existing patient. */
export const PatientSubResources = ({ patient }: { patient: any }) => {
  const qc = useQueryClient();
  const can = useCan();
  const editable = can('patients.update') && patient.status !== 'ARCHIVED';
  const [err, setErr] = useState<unknown>(null);
  const [addr, setAddr] = useState({ addressLine1: '', city: '', postalCode: '' });
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '' });
  const [tag, setTag] = useState({ tagName: '', tagColor: '#1FA971' });
  const [relative, setRelative] = useState<PatientHit | null>(null);
  const [relationship, setRelationship] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['patient', patient.id] });
    qc.invalidateQueries({ queryKey: ['patient-summary', patient.id] });
  };
  const run = (fn: () => Promise<any>, after?: () => void) => async () => {
    setErr(null);
    try {
      await fn();
      after?.();
      refresh();
    } catch (e) {
      setErr(e);
    }
  };
  const base = `/patients/${patient.id}`;

  const families = [
    ...(patient.familyMembers ?? []).map((f: any) => ({ id: f.id, other: f.relatedPatient, relationship: f.relationship })),
    ...(patient.relatedFamilyMembers ?? []).map((f: any) => ({ id: f.id, other: f.patient, relationship: f.relationship ? `${f.relationship} (of)` : null })),
  ];

  return (
    <div className="space-y-4">
      <ErrorBox error={err} />
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Addresses">
          <ul className="space-y-2 text-sm">
            {(patient.addresses ?? []).map((a: any) => (
              <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 p-2">
                <span>
                  {[a.addressLine1, a.addressLine2, a.city, a.state, a.postalCode].filter(Boolean).join(', ') || '—'}
                  {a.addressType && <span className="ml-2 text-xs text-slate-500">{a.addressType}</span>}
                </span>
                {editable && (
                  <button className="text-slate-400 hover:text-red-600" aria-label="Remove address" onClick={run(() => api.delete(`${base}/addresses/${a.id}`))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
            {!patient.addresses?.length && <li className="text-slate-500">No addresses</li>}
          </ul>
          {editable && (
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <input className={`${inputCls} sm:col-span-2`} placeholder="Address" value={addr.addressLine1} onChange={(e) => setAddr({ ...addr, addressLine1: e.target.value })} />
              <input className={inputCls} placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={!addr.addressLine1 && !addr.city}
                onClick={run(() => api.post(`${base}/addresses`, clean({ addressType: 'HOME', ...addr })), () => setAddr({ addressLine1: '', city: '', postalCode: '' }))}
              >
                <Plus size={14} /> Add
              </Button>
            </div>
          )}
        </Section>

        <Section title="Emergency contacts">
          <ul className="space-y-2 text-sm">
            {(patient.emergencyContacts ?? []).map((c: any) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
                <span>
                  <span className="font-medium">{c.name}</span> {c.relationship && <span className="text-slate-500">({c.relationship})</span>} {c.phone}
                </span>
                {editable && (
                  <button className="text-slate-400 hover:text-red-600" aria-label="Remove contact" onClick={run(() => api.delete(`${base}/emergency-contacts/${c.id}`))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
            {!patient.emergencyContacts?.length && <li className="text-slate-500">No emergency contacts</li>}
          </ul>
          {editable && (
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <input className={inputCls} placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              <input className={inputCls} placeholder="Relation" value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} />
              <input className={inputCls} placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={!contact.name}
                onClick={run(() => api.post(`${base}/emergency-contacts`, clean(contact)), () => setContact({ name: '', relationship: '', phone: '' }))}
              >
                <Plus size={14} /> Add
              </Button>
            </div>
          )}
        </Section>

        <Section title="Tags">
          <div className="flex flex-wrap gap-2">
            {(patient.tags ?? []).map((t: any) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: t.tagColor || '#64748b' }}>
                {t.tagName}
                {editable && (
                  <button aria-label={`Remove tag ${t.tagName}`} onClick={run(() => api.delete(`${base}/tags/${t.id}`))}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {!patient.tags?.length && <span className="text-sm text-slate-500">No tags</span>}
          </div>
          {editable && (
            <div className="mt-3 flex gap-2">
              <input className={inputCls} placeholder="New tag" value={tag.tagName} onChange={(e) => setTag({ ...tag, tagName: e.target.value })} />
              <input type="color" className="h-10 w-12 rounded border border-slate-200" value={tag.tagColor} onChange={(e) => setTag({ ...tag, tagColor: e.target.value })} aria-label="Tag colour" />
              <Button size="sm" variant="outline" disabled={!tag.tagName.trim()} onClick={run(() => api.post(`${base}/tags`, tag), () => setTag({ ...tag, tagName: '' }))}>
                Add
              </Button>
            </div>
          )}
        </Section>

        <Section title="Family members">
          <ul className="space-y-2 text-sm">
            {families.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
                <Link to={`/patients/${f.other?.id}`} className="text-[#1FA971] hover:underline">
                  {fullName(f.other)} <span className="text-slate-500">{f.other?.patientCode}</span>
                </Link>
                <span className="text-xs text-slate-500">{f.relationship}</span>
                {editable && (
                  <button className="text-slate-400 hover:text-red-600" aria-label="Unlink" onClick={run(() => api.delete(`${base}/family-members/${f.id}`))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
            {!families.length && <li className="text-slate-500">No linked family members</li>}
          </ul>
          {editable && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <PatientPicker value={relative} onChange={setRelative} placeholder="Find family member…" />
              </div>
              <input className={inputCls} placeholder="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
              <Button
                size="sm"
                variant="outline"
                disabled={!relative}
                onClick={run(
                  () => api.post(`${base}/family-members`, clean({ relatedPatientId: relative?.id, relationship })),
                  () => {
                    setRelative(null);
                    setRelationship('');
                  },
                )}
              >
                Link
              </Button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
};
