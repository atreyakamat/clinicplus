import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Input, Button, PageHeader } from '@clinicplus/ui';
import { api, ApiError } from '../../app/lib/api';

const appointmentSchema = z.object({
  patientId: z.string().uuid('Invalid Patient ID'),
  doctorId: z.string().uuid('Invalid Doctor ID'),
  date: z.string().min(1, 'Date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  notes: z.string().optional(),
});

type AppointmentFormValues = z.infer<typeof appointmentSchema>;

export const AppointmentFormPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const patientIdFromQuery = searchParams.get('patientId') || '';

  const { data: doctors } = useQuery<any[]>({
    queryKey: ['doctors'],
    queryFn: () => api.get('/users?role=doctor'),
  });

  // Fetch patients
  const { data: patients } = useQuery<any[]>({
    queryKey: ['patients'],
    queryFn: () => api.get('/patients'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      patientId: patientIdFromQuery,
    }
  });

  const mutation = useMutation({
    mutationFn: (values: AppointmentFormValues) => {
      const scheduledStart = new Date(`${values.date}T${values.startTime}`);
      const scheduledEnd = new Date(`${values.date}T${values.endTime}`);
      
      if (scheduledStart < new Date()) {
        throw new Error('Cannot book an appointment in the past');
      }

      return api.post('/appointments', {
        patientId: values.patientId,
        doctorId: values.doctorId,
        scheduledStart,
        scheduledEnd,
        notes: values.notes,
      });
    },
    onSuccess: () => {
      navigate('/appointments');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setServerError(error.data?.message || 'Failed to schedule appointment');
      } else {
        setServerError('An unexpected error occurred');
      }
    }
  });

  const onSubmit = (data: AppointmentFormValues) => {
    const scheduledStart = new Date(`${data.date}T${data.startTime}`);
    if (scheduledStart < new Date()) {
      setServerError('Cannot book an appointment in the past');
      return;
    }
    setServerError(null);
    mutation.mutate(data);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link to="/appointments" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
          <ArrowLeft size={20} />
        </Link>
        <PageHeader title="New Appointment" description="Book a new session for a patient." />
      </div>

      {serverError && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Patient *</label>
            <select
              {...register('patientId')}
              className={`w-full h-11 rounded-xl border ${errors.patientId ? 'border-red-500' : 'border-slate-200'} px-3 text-sm outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971] bg-white`}
            >
              <option value="">Select Patient</option>
              {patients?.map(p => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
              ))}
            </select>
            {errors.patientId && <p className="text-xs text-red-600">{errors.patientId.message}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Doctor *</label>
            <select
              {...register('doctorId')}
              className={`w-full h-11 rounded-xl border ${errors.doctorId ? 'border-red-500' : 'border-slate-200'} px-3 text-sm outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971] bg-white`}
            >
              <option value="">Select Doctor</option>
              {doctors?.map(d => (
                <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>
              ))}
            </select>
            {errors.doctorId && <p className="text-xs text-red-600">{errors.doctorId.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Date *</label>
              <input
                type="date"
                {...register('date')}
                className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Start Time *</label>
              <input
                type="time"
                {...register('startTime')}
                className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">End Time *</label>
              <input
                type="time"
                {...register('endTime')}
                className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Notes</label>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Reason for visit, symptoms, etc."
              className="w-full p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={() => navigate('/appointments')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || mutation.isPending}>
            {isSubmitting || mutation.isPending ? 'Booking...' : 'Book Appointment'}
          </Button>
        </div>
      </form>
    </div>
  );
};
