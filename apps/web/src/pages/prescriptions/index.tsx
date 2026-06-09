import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

export const PrescriptionsPage = () => {
  const { data: prescriptions, isLoading } = useQuery<any[]>({
    queryKey: ['prescriptions'],
    queryFn: () => api.get('/prescriptions'),
  });

  if (isLoading) {
    return <div className="p-6 text-slate-500">Loading prescriptions...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prescriptions"
        description="Track recently issued prescriptions and jump into the full medication detail."
      />

      <div className="space-y-4">
        {!prescriptions?.length ? (
          <Card className="p-10 text-center text-slate-500">
            No prescriptions have been generated yet.
          </Card>
        ) : (
          prescriptions.map((prescription) => (
            <Card key={prescription.id} className="p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    {prescription.patient?.firstName} {prescription.patient?.lastName}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Dr. {prescription.doctor?.lastName} • {new Date(prescription.issuedAt).toLocaleDateString()}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {prescription.items?.slice(0, 3).map((item: any) => (
                      <Badge key={item.id} variant="outline">{item.medicineName}</Badge>
                    ))}
                    {prescription.items?.length > 3 && <Badge variant="outline">+{prescription.items.length - 3} more</Badge>}
                  </div>
                </div>
                <Link to={`/prescriptions/${prescription.id}`}>
                  <Button variant="outline" size="sm">View Prescription</Button>
                </Link>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
