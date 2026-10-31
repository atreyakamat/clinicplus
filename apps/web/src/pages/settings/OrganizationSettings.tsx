import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';

interface OrgForm {
  name: string;
  legalName: string;
  email: string;
  phone: string;
  website: string;
}

/** Organization identity & contact details (PATCH /organizations/current, organizations.update). */
export const OrganizationSettings = () => {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { data: org, isLoading, error } = useQuery({
    queryKey: ['organization', 'current'],
    queryFn: async () => unwrap<any>(await api.get('/organizations/current')),
  });

  const { register, handleSubmit, formState } = useForm<OrgForm>({
    values: org
      ? {
          name: org.name ?? '',
          legalName: org.legalName ?? '',
          email: org.email ?? '',
          phone: org.phone ?? '',
          website: org.website ?? '',
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: OrgForm) => api.patch('/organizations/current', values),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });

  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading organization…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{apiErrorMessage(error)}</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Organization profile" description="Shown on invoices, prescriptions and patient messages." />
      <form
        onSubmit={handleSubmit((v) => {
          setSaved(false);
          mutation.mutate(v);
        })}
        className="space-y-6"
      >
        <Card className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          <Input label="Clinic name" required {...register('name', { required: 'Clinic name is required' })} error={formState.errors.name?.message} />
          <Input label="Registered / legal name" {...register('legalName')} />
          <Input label="Contact e-mail" type="email" {...register('email')} />
          <Input label="Contact phone" type="tel" {...register('phone')} />
          <div className="sm:col-span-2">
            <Input label="Website" type="url" placeholder="https://" {...register('website')} />
          </div>
        </Card>
        {mutation.error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{apiErrorMessage(mutation.error)}</div>}
        {saved && <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Organization profile saved.</div>}
        <div className="flex justify-end">
          <Button type="submit" className="gap-2" disabled={mutation.isPending}>
            <Save size={16} /> {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
};
