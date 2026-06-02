import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { Input, Button, PageHeader } from '@clinicplus/ui';
import { api, ApiError } from '../../app/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const patientSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  patientCode: z.string().optional(),
});

type PatientFormValues = z.infer<typeof patientSchema>;

interface Patient extends PatientFormValues {
  id: string;
}

export const PatientFormPage = () => {
  const { id } = useParams();
  const isEditing = !!id && id !== 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: patient, isLoading: isFetching } = useQuery<Patient>({
    queryKey: ['patient', id],
    queryFn: () => api.get(`/patients/${id}`),
    enabled: isEditing,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    values: patient ? {
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email || '',
      phone: patient.phone || '',
      gender: patient.gender || '',
      bloodGroup: patient.bloodGroup || '',
      patientCode: patient.patientCode || '',
    } : undefined,
  });

  const mutation = useMutation({
    mutationFn: (data: PatientFormValues) => 
      isEditing ? api.patch(`/patients/${id}`, data) : api.post('/patients', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      navigate('/patients');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setServerError(error.message);
      } else {
        setServerError('An unexpected error occurred');
      }
    }
  });

  const onSubmit = (data: PatientFormValues) => {
    setServerError(null);
    mutation.mutate(data);
  };

  if (isFetching) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/patients" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
          <ArrowLeft size={20} />
        </Link>
        <PageHeader 
          title={isEditing ? 'Edit Patient' : 'Create Patient'} 
          description="Enter patient personal and contact details."
        />
      </div>

      {serverError && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="First Name *"
            {...register('firstName')}
            error={errors.firstName?.message}
          />
          <Input
            label="Last Name *"
            {...register('lastName')}
            error={errors.lastName?.message}
          />
          <Input
            label="Patient Code (Optional)"
            {...register('patientCode')}
            error={errors.patientCode?.message}
          />
          <Input
            label="Email Address"
            type="email"
            {...register('email')}
            error={errors.email?.message}
          />
          <Input
            label="Phone Number"
            {...register('phone')}
            error={errors.phone?.message}
          />
          
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Gender</label>
            <select
              {...register('gender')}
              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971] bg-white"
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Blood Group</label>
            <select
              {...register('bloodGroup')}
              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971] bg-white"
            >
              <option value="">Select Blood Group</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={() => navigate('/patients')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || mutation.isPending}>
            {isSubmitting || mutation.isPending ? 'Saving...' : 'Save Patient'}
          </Button>
        </div>
      </form>
    </div>
  );
};
