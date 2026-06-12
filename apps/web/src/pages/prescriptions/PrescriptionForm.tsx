import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, Printer, Save, ArrowLeft, Clock } from 'lucide-react';
import { Button, Input, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

const FREQUENCY_OPTIONS = [
  { label: '1-0-1', value: '1-0-1 (Twice Daily)' },
  { label: '1-1-1', value: '1-1-1 (Three Times Daily)' },
  { label: '1-0-0', value: '1-0-0 (Once Daily - Morning)' },
  { label: '0-0-1', value: '0-0-1 (Once Daily - Night)' },
];

const DURATION_OPTIONS = ['3 days', '5 days', '7 days', '14 days', '1 month'];

export const PrescriptionForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patientId');
  const consultationId = searchParams.get('consultationId');
  const queryClient = useQueryClient();

  const { register, control, handleSubmit, setValue, watch, formState: { errors } } = useForm({
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
      if (consultationId) {
        queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] });
        // Return to consultation workspace instead of prescription detail
        navigate(`/consultations/${consultationId}`);
      } else {
        navigate(`/prescriptions/${data.id}`);
      }
    }
  });

  const onSubmit = (data: any) => mutation.mutate(data);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <PageHeader title="Create Prescription" description="Add medications and instructions for the patient." />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">Medications</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ medicineName: '', dosage: '', frequency: '', duration: '', instructions: '' })} className="gap-2 bg-slate-50 border-slate-200">
                <Plus size={16} /> Add Another Medicine
              </Button>
            </div>

            <div className="space-y-6 mt-4">
              {fields.map((field, index) => (
                <div key={field.id} className="p-6 bg-slate-50/50 rounded-2xl border border-slate-200 relative group transition-all hover:border-[#1FA971]/30 hover:bg-white hover:shadow-sm">
                  <div className="absolute -left-3 top-6 w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 border-2 border-white">
                    {index + 1}
                  </div>
                  
                  {fields.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => remove(index)} 
                      className="absolute -right-2 -top-2 w-8 h-8 bg-white rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-100 shadow-sm transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-6">
                      <Input 
                        label="Medicine Name" 
                        {...register(`items.${index}.medicineName` as const, { required: true })} 
                        placeholder="e.g. Paracetamol 500mg" 
                        className={errors.items?.[index]?.medicineName ? 'border-red-500' : ''}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Input 
                        label="Dosage" 
                        {...register(`items.${index}.dosage` as const)} 
                        placeholder="e.g. 1 tablet" 
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Input 
                        label="Duration" 
                        {...register(`items.${index}.duration` as const)} 
                        placeholder="e.g. 5 days" 
                      />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {DURATION_OPTIONS.map(d => (
                          <button 
                            key={d} 
                            type="button" 
                            onClick={() => setValue(`items.${index}.duration`, d)}
                            className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded hover:bg-[#1FA971] hover:text-white transition-colors"
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="md:col-span-12 lg:col-span-6">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          <Clock size={14} className="text-[#1FA971]" />
                          Frequency
                        </label>
                        <Input 
                          {...register(`items.${index}.frequency` as const)} 
                          placeholder="e.g. 1-0-1" 
                        />
                        <div className="flex flex-wrap gap-2 mt-2">
                          {FREQUENCY_OPTIONS.map(opt => (
                            <button 
                              key={opt.label} 
                              type="button" 
                              onClick={() => setValue(`items.${index}.frequency`, opt.value)}
                              className="text-xs px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg hover:border-[#1FA971] hover:text-[#1FA971] transition-all"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-12 lg:col-span-6">
                      <Input 
                        label="Special Instructions" 
                        {...register(`items.${index}.instructions` as const)} 
                        placeholder="e.g. After food" 
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        {['After Food', 'Before Food', 'Empty Stomach', 'At Bedtime'].map(inst => (
                          <button 
                            key={inst} 
                            type="button" 
                            onClick={() => setValue(`items.${index}.instructions`, inst)}
                            className="text-xs px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg hover:border-[#1FA971] hover:text-[#1FA971] transition-all"
                          >
                            {inst}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Discard</Button>
          <div className="flex gap-3">
             <Button type="submit" disabled={mutation.isPending} className="gap-2 px-8 py-6 text-lg font-bold shadow-lg shadow-[#1FA971]/20">
              <Save size={20} /> {mutation.isPending ? 'Saving...' : 'Finalize & Generate Prescription'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
