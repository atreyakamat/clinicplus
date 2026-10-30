import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from '@clinicplus/ui';
import { ApiError, api, apiErrorMessage, unwrap } from '../../app/lib/api';
import { useAuthStore, type AuthSession } from '../../app/store/auth.store';
import { AuthShell, ErrorBanner, passwordSchema } from './shared';

const schema = z
  .object({
    firstName: z.string().trim().min(1, { message: 'First name is required' }).max(80),
    lastName: z.string().trim().min(1, { message: 'Last name is required' }).max(80),
    phone: z.string().max(20).optional(),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Values = z.infer<typeof schema>;

interface InvitePreview {
  email: string;
  organizationName: string;
  roleName: string | null;
  branchName: string | null;
  expiresAt: string;
}

export const AcceptInvitePage = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });

  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: async () => unwrap<InvitePreview>(await api.get(`/staff-invitations/token/${token}`)),
    retry: false,
    enabled: /^[0-9a-f]{64}$/i.test(token),
  });

  const onSubmit = async (values: Values) => {
    setError(null);
    try {
      if (isAuthenticated) logout();
      const session = unwrap<AuthSession>(
        await api.post(`/staff-invitations/accept/${token}`, {
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone || undefined,
          password: values.password,
        }),
      );
      setSession(session);
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const loadError =
    !/^[0-9a-f]{64}$/i.test(token)
      ? 'This invitation link is invalid.'
      : preview.error instanceof ApiError && preview.error.status === 410
        ? 'This invitation has expired. Ask your clinic administrator to send a new one.'
        : preview.error
          ? 'This invitation is no longer valid. It may have been used or revoked.'
          : null;

  return (
    <AuthShell subtitle="Join your clinic team">
      {loadError ? (
        <>
          <ErrorBanner message={loadError} />
          <Link to="/auth/login" className="block text-center text-sm font-medium text-[#1FA971] hover:underline">
            Go to sign in
          </Link>
        </>
      ) : preview.isLoading ? (
        <p className="py-8 text-center text-sm text-slate-500">Checking your invitation…</p>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="rounded-xl bg-[#1FA971]/5 p-4 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">{preview.data?.organizationName}</span> invited{' '}
              <span className="font-medium">{preview.data?.email}</span>
              {preview.data?.roleName ? <> as <span className="font-medium">{preview.data.roleName}</span></> : null}
              {preview.data?.branchName ? <> at {preview.data.branchName}</> : null}.
            </p>
            {preview.data?.expiresAt && (
              <p className="mt-1 text-xs text-slate-500">Expires {new Date(preview.data.expiresAt).toLocaleDateString()}</p>
            )}
          </div>
          {error && <ErrorBanner message={error} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="First name" autoComplete="given-name" {...form.register('firstName')} error={form.formState.errors.firstName?.message} />
            <Input label="Last name" autoComplete="family-name" {...form.register('lastName')} error={form.formState.errors.lastName?.message} />
          </div>
          <Input label="Mobile (optional)" type="tel" autoComplete="tel" {...form.register('phone')} error={form.formState.errors.phone?.message} />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            helperText="8+ characters with upper- and lower-case letters and a digit or symbol"
            {...form.register('password')}
            error={form.formState.errors.password?.message}
          />
          <Input label="Confirm password" type="password" autoComplete="new-password" {...form.register('confirm')} error={form.formState.errors.confirm?.message} />
          <Button type="submit" disabled={form.formState.isSubmitting} className="w-full bg-[#1FA971] hover:bg-[#1A8D5E]">
            {form.formState.isSubmitting ? 'Activating…' : 'Activate account'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
};
