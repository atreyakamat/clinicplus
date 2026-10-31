import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Input } from '@clinicplus/ui';
import { api, apiErrorMessage } from '../../app/lib/api';
import { AuthShell, ErrorBanner, SuccessBanner, passwordSchema } from './shared';

const schema = z
  .object({ newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Values = z.infer<typeof schema>;

export const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const validToken = /^[0-9a-f]{64}$/i.test(token);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, newPassword: values.newPassword });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  return (
    <AuthShell subtitle="Choose a new password">
      {!validToken ? (
        <>
          <ErrorBanner message="This reset link is invalid or incomplete. Request a new one." />
          <Link to="/auth/forgot-password" className="block text-center text-sm font-medium text-[#1FA971] hover:underline">
            Request a new link
          </Link>
        </>
      ) : done ? (
        <>
          <SuccessBanner>Your password has been reset and all other sessions were signed out.</SuccessBanner>
          <Link to="/auth/login" className="block w-full rounded-xl bg-[#1FA971] py-2.5 text-center text-sm font-medium text-white hover:bg-[#1A8D5E]">
            Sign in
          </Link>
        </>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {error && <ErrorBanner message={error} />}
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            helperText="8+ characters with upper- and lower-case letters and a digit or symbol"
            {...form.register('newPassword')}
            error={form.formState.errors.newPassword?.message}
          />
          <Input label="Confirm password" type="password" autoComplete="new-password" {...form.register('confirm')} error={form.formState.errors.confirm?.message} />
          <Button type="submit" disabled={form.formState.isSubmitting} className="w-full bg-[#1FA971] hover:bg-[#1A8D5E]">
            {form.formState.isSubmitting ? 'Saving…' : 'Reset password'}
          </Button>
          {error && (
            <Link to="/auth/forgot-password" className="block text-center text-sm text-slate-500 hover:underline">
              Request a new link
            </Link>
          )}
        </form>
      )}
    </AuthShell>
  );
};
