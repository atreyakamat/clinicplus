import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Monitor, ShieldCheck } from 'lucide-react';
import { Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';
import { useAuthStore } from '../../app/store/auth.store';
import { passwordSchema } from '../auth/shared';

const schema = z
  .object({
    currentPassword: z.string().min(1, { message: 'Enter your current password' }),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a different password' });
type Values = z.infer<typeof schema>;

interface SessionRow {
  id: string;
  deviceName: string | null;
  ipAddress: string | null;
  loginAt: string;
  expiresAt: string | null;
  current: boolean;
}

/** Best-effort, human friendly device label from a User-Agent string. */
function describeDevice(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export const SecuritySettings = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((s) => s.logout);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });

  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => unwrap<SessionRow[]>(await api.get('/auth/sessions')),
  });

  const changePassword = useMutation({
    mutationFn: (v: Values) => api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => {
      form.reset();
      setNotice({ ok: true, text: 'Password changed. All other devices have been signed out.' });
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err) }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err) }),
  });

  const logoutAll = useMutation({
    mutationFn: () => api.post('/auth/logout-all'),
    onSuccess: () => {
      clearSession();
      navigate('/auth/login');
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err) }),
  });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Security" description="Your password and the devices signed in to your account." />

      {notice && (
        <div className={`rounded-md p-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{notice.text}</div>
      )}

      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
          <KeyRound size={18} className="text-[#1FA971]" /> Change password
        </h3>
        <form
          onSubmit={form.handleSubmit((v) => {
            setNotice(null);
            changePassword.mutate(v);
          })}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          noValidate
        >
          <Input label="Current password" type="password" autoComplete="current-password" {...form.register('currentPassword')} error={form.formState.errors.currentPassword?.message} />
          <Input label="New password" type="password" autoComplete="new-password" {...form.register('newPassword')} error={form.formState.errors.newPassword?.message} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" {...form.register('confirm')} error={form.formState.errors.confirm?.message} />
          <p className="text-xs text-slate-500 sm:col-span-2">8+ characters with upper- and lower-case letters and a digit or symbol.</p>
          <div className="flex justify-end">
            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? 'Saving…' : 'Update password'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <ShieldCheck size={18} className="text-[#1FA971]" /> Active sessions
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-red-600"
            disabled={logoutAll.isPending}
            onClick={() => {
              if (window.confirm('Sign out of every device, including this one?')) logoutAll.mutate();
            }}
          >
            <LogOut size={14} /> Sign out everywhere
          </Button>
        </div>
        {sessions.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading sessions…</p>
        ) : sessions.error ? (
          <p className="p-6 text-sm text-red-600">{apiErrorMessage(sessions.error)}</p>
        ) : !sessions.data?.length ? (
          <p className="p-6 text-sm text-slate-500">No active sessions.</p>
        ) : (
          <ul className="divide-y">
            {sessions.data.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Monitor size={18} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {describeDevice(s.deviceName)}
                      {s.current && <span className="ml-2 rounded-full bg-[#1FA971]/10 px-2 py-0.5 text-xs font-semibold text-[#1FA971]">This device</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      Signed in {new Date(s.loginAt).toLocaleString()}
                      {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                      {s.expiresAt ? ` · expires ${new Date(s.expiresAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" className="self-start text-red-600 sm:self-auto" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
