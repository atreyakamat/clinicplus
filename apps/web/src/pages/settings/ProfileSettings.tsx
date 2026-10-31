import React, { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { User as UserIcon, PenTool, Save, Upload, X } from 'lucide-react';
import { Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../app/store/auth.store';

interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  qualification: string;
  specialization: string;
  registrationNumber: string;
  experienceYears: string;
  bio: string;
  signatureUrl: string;
}

const MAX_SIGNATURE_BYTES = 300 * 1024;

export const ProfileSettings = () => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const isClinician = (user?.roles ?? []).includes('Doctor');

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => unwrap<any>(await api.get('/users/me')),
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: (data: ProfileForm) =>
      api.patch(`/users/${user?.id}`, {
        ...data,
        experienceYears: data.experienceYears === '' ? undefined : Number(data.experienceYears),
      }),
    onSuccess: (_res, vars) => {
      setNotice({ ok: true, text: 'Profile saved.' });
      updateUser({ firstName: vars.firstName, lastName: vars.lastName, phone: vars.phone });
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err) }),
  });

  const { register, handleSubmit, setValue, watch, formState } = useForm<ProfileForm>({
    values: profile
      ? {
          firstName: profile.firstName ?? '',
          lastName: profile.lastName ?? '',
          phone: profile.phone ?? '',
          qualification: profile.qualification ?? '',
          specialization: profile.specialization ?? '',
          registrationNumber: profile.registrationNumber ?? '',
          experienceYears: profile.experienceYears != null ? String(profile.experienceYears) : '',
          bio: profile.bio ?? '',
          signatureUrl: profile.signatureUrl ?? '',
        }
      : undefined,
  });

  const currentSignature = watch('signatureUrl');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIGNATURE_BYTES) {
      setNotice({ ok: false, text: 'Signature image must be smaller than 300 KB.' });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setValue('signatureUrl', reader.result as string, { shouldDirty: true });
    reader.readAsDataURL(file);
  };

  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading profile…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{apiErrorMessage(error)}</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="My profile" description="Your personal and professional details. Your e-mail is your sign-in and can only be changed by an administrator." />

      <form
        onSubmit={handleSubmit((d) => {
          setNotice(null);
          mutation.mutate(d);
        })}
        className="space-y-6"
      >
        <Card className="space-y-6 p-6">
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <UserIcon size={18} className="text-[#1FA971]" />
            Personal details
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="First name" {...register('firstName', { required: 'Required' })} error={formState.errors.firstName?.message} />
            <Input label="Last name" {...register('lastName', { required: 'Required' })} error={formState.errors.lastName?.message} />
            <Input label="E-mail" value={profile?.email ?? ''} disabled readOnly />
            <Input label="Mobile" type="tel" {...register('phone')} />
          </div>
        </Card>

        <Card className="space-y-6 p-6">
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <PenTool size={18} className="text-[#1FA971]" />
            Professional details {isClinician ? '' : <span className="text-xs font-normal text-slate-400">(optional)</span>}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Qualification" {...register('qualification')} placeholder="e.g. MBBS, MD" />
            <Input label="Specialization" {...register('specialization')} placeholder="e.g. Cardiology" />
            <Input label="Registration number" {...register('registrationNumber')} />
            <Input label="Years of experience" type="number" min={0} max={80} {...register('experienceYears')} />
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Short bio
            <textarea {...register('bio')} maxLength={2000} className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:ring-1 focus:ring-[#1FA971]" />
          </label>

          <div className="relative rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            {currentSignature ? (
              <img src={currentSignature} alt="Signature" className="mx-auto mb-4 max-h-24 object-contain" />
            ) : (
              <PenTool size={32} className="mx-auto mb-3 text-slate-300" />
            )}
            <p className="mb-4 text-xs text-slate-500">Digital signature printed on prescriptions (transparent PNG recommended, max 300 KB)</p>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg" className="hidden" />
            <div className="flex justify-center gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> {currentSignature ? 'Change signature' : 'Select file'}
              </Button>
              {currentSignature && (
                <Button type="button" variant="ghost" size="sm" className="gap-1 text-red-600" onClick={() => setValue('signatureUrl', '', { shouldDirty: true })}>
                  <X size={14} /> Remove
                </Button>
              )}
            </div>
          </div>
        </Card>

        {notice && (
          <div className={`rounded-md p-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{notice.text}</div>
        )}
        <div className="flex justify-end gap-3">
          <Button type="submit" className="gap-2" disabled={mutation.isPending}>
            <Save size={16} /> {mutation.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </div>
  );
};
