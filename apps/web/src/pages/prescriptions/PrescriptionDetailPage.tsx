import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Pencil, XCircle, CheckCircle2 } from 'lucide-react';
import { Button, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission } from '../../app/components/HasPermission';
import {
  ageFrom,
  drName,
  ErrorBox,
  Field,
  fmtDate,
  fmtDateTime,
  fullName,
  getData,
  Loading,
  Modal,
  Section,
  StatusPill,
  textareaCls,
} from '../patients/shared';
import { PrescriptionEditor } from './PrescriptionEditor';

export const PrescriptionDetailPage = () => {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);

  const { data: rx, isLoading, error } = useQuery({
    queryKey: ['prescription', id],
    queryFn: () => getData(`/prescriptions/${id}`),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['prescription', id] });
    qc.invalidateQueries({ queryKey: ['prescriptions'] });
  };

  const act = async (fn: () => Promise<any>) => {
    setActionError(null);
    try {
      await fn();
      refresh();
      return true;
    } catch (e) {
      setActionError(e);
      return false;
    }
  };

  if (isLoading) return <Loading />;
  if (error || !rx) return <ErrorBox error={error ?? 'Prescription not found'} />;

  const age = ageFrom(rx.patient?.dateOfBirth);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/prescriptions" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Prescriptions
      </Link>
      <PageHeader title={`Prescription · ${fmtDate(rx.issuedAt)}`} description={`Issued by ${drName(rx.doctor)}`} />
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={rx.status} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => act(() => api.download(`/prescriptions/${rx.id}/download`, `prescription-${rx.id.slice(0, 8)}.pdf`))}
          >
            <Download size={14} /> PDF
          </Button>
          {rx.canEdit && (
            <HasPermission permission="prescriptions.update">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => act(() => api.post(`/prescriptions/${rx.id}/complete`))}
              >
                <CheckCircle2 size={14} /> Mark course completed
              </Button>
              <Button variant="danger" size="sm" className="gap-1" onClick={() => setCancelOpen(true)}>
                <XCircle size={14} /> Cancel
              </Button>
            </HasPermission>
          )}
        </div>
      </div>
      <ErrorBox error={actionError} />

      {rx.status === 'CANCELLED' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Cancelled {fmtDateTime(rx.cancelledAt)} — {rx.cancelReason}
        </div>
      )}

      <Section title="Patient">
        <Link to={`/patients/${rx.patient?.id}`} className="font-medium text-[#1FA971] hover:underline">
          {fullName(rx.patient)}
        </Link>
        <p className="text-sm text-slate-500">
          {rx.patient?.patientCode} · {rx.patient?.gender ?? '—'}
          {age !== null && ` · ${age} yrs`} · {rx.patient?.phone ?? ''}
        </p>
        {rx.consultation && (
          <Link to={`/consultations/${rx.consultation.id}`} className="mt-1 inline-block text-xs text-[#1FA971] hover:underline">
            From consultation on {fmtDate(rx.consultation.consultationDate)}
          </Link>
        )}
      </Section>

      <Section title="Medicines">
        {editing ? (
          <PrescriptionEditor
            existing={{ id: rx.id, patientId: rx.patientId, notes: rx.notes, items: rx.items }}
            onSaved={() => {
              setEditing(false);
              refresh();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Medicine</th>
                    <th className="py-2 pr-3">Dose</th>
                    <th className="py-2 pr-3">Frequency</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2">Instructions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rx.items.map((i: any) => (
                    <tr key={i.id}>
                      <td className="py-2 pr-3 font-medium">{i.medicineName}</td>
                      <td className="py-2 pr-3">{i.dosage || '—'}</td>
                      <td className="py-2 pr-3">{i.frequency || '—'}</td>
                      <td className="py-2 pr-3">{i.duration || '—'}</td>
                      <td className="py-2">{i.instructions || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rx.notes && <p className="mt-3 text-sm text-slate-700">Advice: {rx.notes}</p>}
          </>
        )}
      </Section>

      {cancelOpen && (
        <Modal title="Cancel prescription" onClose={() => setCancelOpen(false)}>
          <div className="space-y-3">
            <Field label="Reason (required)">
              <textarea className={textareaCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelOpen(false)}>
                Keep
              </Button>
              <Button
                variant="danger"
                disabled={reason.trim().length < 3}
                onClick={async () => {
                  if (await act(() => api.post(`/prescriptions/${rx.id}/cancel`, { reason: reason.trim() }))) setCancelOpen(false);
                }}
              >
                Cancel prescription
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
