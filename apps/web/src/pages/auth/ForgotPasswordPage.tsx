import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Button, Input } from '@clinicplus/ui';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';
import { AuthShell, ErrorBanner, SuccessBanner } from './shared';

const schema = z.object({ email: z.string().email({ message: 'Enter a valid e-mail address' }) });
type Values = z.infer<typeof schema>;

export const ForgotPasswordPage = () => {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setError(null);
    try {
      const res = unwrap<{ message: string }>(await api.post('/auth/forgot-password', values));
      setSent(res?.message ?? 'If the e-mail address is registered, a reset link has been issued.');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  return (
    <AuthShell subtitle="Reset your password">
      {error && <ErrorBanner message={error} />}
      {sent ? (
        <>
          <SuccessBanner>
            {sent} The link is valid for 1 hour. Check your inbox (and spam folder). If nothing arrives, ask your
            clinic administrator to confirm your e-mail address.
          </SuccessBanner>
          <Link to="/auth/login" className="block text-center text-sm font-medium text-[#1FA971] hover:underline">
            Back to sign in
          </Link>
        </>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <p className="text-sm text-slate-600">Enter the e-mail address you sign in with and we will send you a reset link.</p>
          <Input label="E-mail" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
          <Button type="submit" disabled={form.formState.isSubmitting} className="w-full bg-[#1FA971] hover:bg-[#1A8D5E]">
            {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
          <Link to="/auth/login" className="block text-center text-sm text-slate-500 hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
};
