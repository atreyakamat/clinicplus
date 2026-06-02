import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, Printer, Save, ArrowLeft } from 'lucide-react';
import { Button, Input, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

export const PrescriptionForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patientId');
  const consultationId = searchParams.get('consultationId');
  const queryClient = useQueryClient();

  const { register, control, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      items: [{ medicineName: '', dosage: '', frequency: '', duration: '', instructions: '' }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/prescriptions', { ...data, patientId, consultationId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions', patientId] });
      navigate(`/prescriptions/${data.id}`);
    }
  });

  const onSubmit = (data: any) => mutation.mutate(data);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <PageHeader title="Create Prescription" description="Add medications and instructions for the patient." />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Medications</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ medicineName: '', dosage: '', frequency: '', duration: '', instructions: '' })} className="gap-1">
                <Plus size={14} /> Add Medicine
              </Button>
            </div>

            <div className="space-y-4 mt-4">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100 relative group">
                  <div className="md:col-span-4">
                    <Input label="Medicine Name" {...register(`items.${index}.medicineName` as const)} placeholder="e.g. Paracetamol 500mg" />
                  </div>
                  <div className="md:col-span-2">
                    <Input label="Dosage" {...register(`items.${index}.dosage` as const)} placeholder="e.g. 1 tab" />
                  </div>
                  <div className="md:col-span-2">
                    <Input label="Frequency" {...register(`items.${index}.frequency` as const)} placeholder="1-0-1" />
                  </div>
                  <div className="md:col-span-2">
                    <Input label="Duration" {...register(`items.${index}.duration` as const)} placeholder="5 days" />
                  </div>
                  <div className="md:col-span-2 flex items-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => remove(index)} className="mb-1 text-red-500 hover:bg-red-50 border-none">
                      <Trash2 size={18} />
                    </Button>
                  </div>
                  <div className="md:col-span-12">
                    <Input label="Instructions" {...register(`items.${index}.instructions` as const)} placeholder="Take after food" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            <Save size={16} /> {mutation.isPending ? 'Saving...' : 'Generate Prescription'}
          </Button>
        </div>
      </form>
    </div>
  );
};
