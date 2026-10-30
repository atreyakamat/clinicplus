import React, { useState } from 'react';
import { AlertTriangle, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { ErrorBox, Field, inputCls, isSafetyWarning, PatientPicker, textareaCls, unwrap, type PatientHit } from '../patients/shared';

export interface RxItem {
  medicineName: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

interface SafetyWarning {
  type: 'ALLERGY' | 'DUPLICATE_ACTIVE' | 'DUPLICATE_IN_REQUEST';
  medicineName: string;
  message: string;
  allergySeverity?: string | null;
}

const blank: RxItem = { medicineName: '', dosage: '', frequency: '', duration: '', instructions: '' };
const FREQUENCIES = ['OD (once daily)', 'BD (twice daily)', 'TDS (thrice daily)', 'QID (4 times)', 'HS (at bedtime)', 'SOS (as needed)', 'Weekly'];

const cleanItem = (i: RxItem) => {
  const out: Record<string, string> = { medicineName: i.medicineName.trim() };
  for (const k of ['dosage', 'frequency', 'duration', 'instructions'] as const) if (i[k]?.trim()) out[k] = i[k]!.trim();
  return out;
};

/**
 * Create / edit a prescription with allergy and duplicate-therapy checks.
 * Warnings must be explicitly acknowledged before the API accepts the save.
 */
export const PrescriptionEditor = ({
  patient: fixedPatient,
  consultationId,
  existing,
  onSaved,
  onCancel,
}: {
  patient?: PatientHit | null;
  consultationId?: string;
  existing?: { id: string; patientId: string; notes?: string | null; items: RxItem[] };
  onSaved: (rx: any) => void;
  onCancel?: () => void;
}) => {
  const [patient, setPatient] = useState<PatientHit | null>(fixedPatient ?? null);
  const [items, setItems] = useState<RxItem[]>(existing?.items?.length ? existing.items.map((i) => ({ ...blank, ...i })) : [{ ...blank }]);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [warnings, setWarnings] = useState<SafetyWarning[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const patientId = existing?.patientId ?? patient?.id;
  const valid = !!patientId && items.some((i) => i.medicineName.trim().length >= 2);

  const update = (idx: number, patch: Partial<RxItem>) => {
    setItems((all) => all.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    setWarnings(null);
    setAcknowledged(false);
  };

  const payloadItems = () => items.filter((i) => i.medicineName.trim()).map(cleanItem);

  const save = async () => {
    if (!patientId) return;
    setBusy(true);
    setError(null);
    try {
      const its = payloadItems();
      // 1) Dry-run safety check unless the doctor already acknowledged these warnings.
      if (!acknowledged) {
        const res = await unwrap<{ warnings: SafetyWarning[] }>(
          api.post('/prescriptions/check-safety', { patientId, items: its, ...(existing ? { excludePrescriptionId: existing.id } : {}) }),
        );
        if (res.warnings.length) {
          setWarnings(res.warnings);
          return;
        }
      }
      // 2) Save.
      const body = { items: its, ...(notes.trim() ? { notes: notes.trim() } : {}), acknowledgeWarnings: acknowledged || undefined };
      const rx = existing
        ? await unwrap(api.patch(`/prescriptions/${existing.id}`, body))
        : await unwrap(api.post('/prescriptions', { ...body, patientId, ...(consultationId ? { consultationId } : {}) }));
      onSaved(rx);
    } catch (e) {
      if (isSafetyWarning(e)) {
        // Data changed between the check and the save — re-run the check to show fresh warnings.
        setAcknowledged(false);
        setWarnings(null);
      }
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!existing && !fixedPatient && (
        <Field label="Patient">
          <PatientPicker value={patient} onChange={setPatient} />
        </Field>
      )}
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-12">
            <input
              className={`${inputCls} sm:col-span-4`}
              placeholder="Medicine (e.g. Paracetamol 500mg)"
              value={it.medicineName}
              onChange={(e) => update(idx, { medicineName: e.target.value })}
              aria-label="Medicine name"
            />
            <input className={`${inputCls} sm:col-span-2`} placeholder="Dose" value={it.dosage} onChange={(e) => update(idx, { dosage: e.target.value })} aria-label="Dosage" />
            <input
              className={`${inputCls} sm:col-span-2`}
              list="rx-frequencies"
              placeholder="Frequency"
              value={it.frequency}
              onChange={(e) => update(idx, { frequency: e.target.value })}
              aria-label="Frequency"
            />
            <input className={`${inputCls} sm:col-span-2`} placeholder="Duration" value={it.duration} onChange={(e) => update(idx, { duration: e.target.value })} aria-label="Duration" />
            <div className="flex gap-2 sm:col-span-2">
              <input className={inputCls} placeholder="Notes" value={it.instructions} onChange={(e) => update(idx, { instructions: e.target.value })} aria-label="Instructions" />
              <button
                type="button"
                className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                disabled={items.length === 1}
                onClick={() => setItems(items.filter((_, i) => i !== idx))}
                aria-label="Remove medicine"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        <datalist id="rx-frequencies">
          {FREQUENCIES.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setItems([...items, { ...blank }])}>
          <Plus size={14} /> Add medicine
        </Button>
      </div>
      <Field label="Advice / notes">
        <textarea className={textareaCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {warnings && warnings.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} /> Safety warnings
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i} className={w.type === 'ALLERGY' ? 'font-medium text-red-700' : ''}>
                {w.type === 'ALLERGY' ? 'Allergy: ' : 'Duplicate: '}
                {w.message}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            I have reviewed these warnings and want to prescribe anyway
          </label>
        </div>
      )}
      <ErrorBox error={error} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" onClick={save} disabled={!valid || busy || (!!warnings?.length && !acknowledged)} className="gap-2">
          {busy && <Loader2 size={16} className="animate-spin" />}
          {warnings?.length ? 'Save with acknowledged warnings' : existing ? 'Save changes' : 'Issue prescription'}
        </Button>
      </div>
    </div>
  );
};
