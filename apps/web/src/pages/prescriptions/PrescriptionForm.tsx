import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@clinicplus/ui';
import { HasPermission } from '../../app/components/HasPermission';
import { Empty, getData, Loading, Section } from '../patients/shared';
import { PrescriptionEditor } from './PrescriptionEditor';

export const PrescriptionForm = () => {
  const [params] = useSearchParams();
  const patientId = params.get('patientId');
  const consultationId = params.get('consultationId') ?? undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => getData(`/patients/${patientId}`),
    enabled: !!patientId,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/prescriptions" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Prescriptions
      </Link>
      <PageHeader title="New prescription" description="Allergy and duplicate-therapy checks run before the prescription is issued." />
      <HasPermission permission="prescriptions.create" fallback={<Empty title="Only doctors can issue prescriptions" />}>
        {patientId && isLoading ? (
          <Loading />
        ) : (
          <Section title="Medicines">
            <PrescriptionEditor
              patient={patient ? (patient as any) : null}
              consultationId={consultationId}
              onSaved={(rx) => {
                qc.invalidateQueries({ queryKey: ['prescriptions'] });
                navigate(`/prescriptions/${rx.id}`);
              }}
              onCancel={() => navigate(-1)}
            />
          </Section>
        )}
      </HasPermission>
    </div>
  );
};
