import React, { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { User as UserIcon, PenTool, Save, Upload } from 'lucide-react';
import { Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../app/store/auth.store';

export const ProfileSettings = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => api.get(`/users/${user?.id}`),
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.patch(`/users/${user?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    }
  });

  const { register, handleSubmit, setValue, watch } = useForm({
    values: profile ? {
      firstName: profile.firstName,
      lastName: profile.lastName,
      qualification: profile.qualification || '',
      specialization: profile.specialization || '',
      registrationNumber: profile.registrationNumber || '',
      signatureUrl: profile.signatureUrl || '',
    } : undefined
  });

  const currentSignature = watch('signatureUrl');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setValue('signatureUrl', reader.result as string, { shouldDirty: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = (data: any) => mutation.mutate(data);

  if (isLoading) return <div className="p-6">Loading profile...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader 
        title="My Profile" 
        description="Manage your personal details and professional signature."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6 space-y-6">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <UserIcon size={18} className="text-[#1FA971]" />
            Personal Details
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" {...register('firstName')} />
            <Input label="Last Name" {...register('lastName')} />
            <Input label="Qualification" {...register('qualification')} placeholder="e.g. MBBS, MD" />
            <Input label="Specialization" {...register('specialization')} placeholder="e.g. Cardiology" />
            <Input label="Registration Number" {...register('registrationNumber')} />
          </div>
        </Card>

        <Card className="p-6 space-y-6">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <PenTool size={18} className="text-[#1FA971]" />
            Digital Signature
          </h3>
          
          <div className="space-y-4">
             <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50 relative">
                {currentSignature ? (
                  <img src={currentSignature} alt="Signature" className="mx-auto max-h-24 mb-4 object-contain" />
                ) : (
                  <PenTool size={32} className="mx-auto text-slate-300 mb-3" />
                )}
                
                <p className="text-xs text-slate-500 mb-4">Upload your professional signature (PNG transparent recommended)</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/png, image/jpeg" 
                  className="hidden" 
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} /> {currentSignature ? 'Change Signature' : 'Select File'}
                </Button>
             </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" className="gap-2" disabled={mutation.isPending}>
            <Save size={16} /> {mutation.isPending ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </form>
    </div>
  );
};
