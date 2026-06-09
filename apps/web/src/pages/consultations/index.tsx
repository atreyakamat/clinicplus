import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

export const ConsultationsPage = () => {
  const { data: consultations, isLoading } = useQuery<any[]>({
    queryKey: ['consultations'],
    queryFn: () => api.get('/consultations'),
  });

  if (isLoading) {
    return <div className="p-6 text-slate-500">Loading consultations...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consultation History"
        description="Review patient encounters, diagnoses, and treatment plans recorded by the care team."
      />

      <div className="space-y-4">
        {!consultations?.length ? (
          <Card className="p-10 text-center text-slate-500">
            No consultations have been recorded yet.
          </Card>
        ) : (
          consultations.map((consultation) => (
            <Card key={consultation.id} className="p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-slate-900">
                    {consultation.patient?.firstName} {consultation.patient?.lastName}
                  </div>
                  <div className="text-sm text-slate-500">
                    Dr. {consultation.doctor?.lastName} • {new Date(consultation.consultationDate).toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-700">
                    {consultation.chiefComplaint || 'No chief complaint recorded'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {consultation.diagnoses?.map((diagnosis: any) => (
                      <Badge key={diagnosis.id} variant="outline">{diagnosis.diagnosisName}</Badge>
                    ))}
                    {!consultation.diagnoses?.length && <Badge variant="outline">No diagnoses</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge>{consultation.status}</Badge>
                  <Link to={`/consultations/${consultation.id}`}>
                    <Button variant="outline" size="sm">Open Workspace</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
