import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Monitor, ShieldCheck, Smartphone } from 'lucide-react';
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

      <TwoFactorCard />

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

interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}
interface SetupResponse {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

/**
 * Self-service TOTP two-factor authentication. Set up shows a QR + manual key,
 * confirms a code, then reveals one-time recovery codes once. Disable asks for a
 * current code or the account password.
 */
const TwoFactorCard = () => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Flow: idle → 'setup' (scan + confirm) → 'recovery' (show codes once)
  const [mode, setMode] = useState<'idle' | 'setup' | 'recovery'>('idle');
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disableSecret, setDisableSecret] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const status = useQuery({
    queryKey: ['auth', '2fa', 'status'],
    queryFn: async () => unwrap<TwoFactorStatus>(await api.get('/auth/2fa/status')),
  });

  const reset = () => {
    setMode('idle');
    setSetupData(null);
    setCode('');
    setRecoveryCodes([]);
    setDisableSecret('');
    setShowDisable(false);
    setError(null);
  };

  const beginSetup = useMutation({
    mutationFn: async () => unwrap<SetupResponse>(await api.post('/auth/2fa/setup')),
    onSuccess: (data) => {
      setSetupData(data);
      setMode('setup');
      setError(null);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const enable = useMutation({
    mutationFn: async () => unwrap<{ recoveryCodes: string[] }>(await api.post('/auth/2fa/enable', { code })),
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setMode('recovery');
      setCode('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['auth', '2fa', 'status'] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const body = /^[0-9]{6}$/.test(disableSecret.trim()) ? { code: disableSecret.trim() } : { password: disableSecret };
      return api.post('/auth/2fa/disable', body);
    },
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ['auth', '2fa', 'status'] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const copyCodes = () => {
    navigator.clipboard?.writeText(recoveryCodes.join('\n')).catch(() => undefined);
  };

  return (
    <Card className="p-6">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-900">
        <Smartphone size={18} className="text-[#1FA971]" /> Two-factor authentication
      </h3>
      <p className="mb-4 text-sm text-slate-500">
        Protect your account with a time-based code from an authenticator app (Google Authenticator, Authy, 1Password…).
      </p>

      {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {status.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : status.error ? (
        <p className="text-sm text-red-600">{apiErrorMessage(status.error)}</p>
      ) : mode === 'recovery' ? (
        <div className="space-y-4">
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Save these recovery codes somewhere safe. Each can be used once if you lose your authenticator. They will not be shown again.
          </div>
          <ul className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm">
            {recoveryCodes.map((rc) => (
              <li key={rc} className="text-slate-800">{rc}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyCodes}>Copy codes</Button>
            <Button size="sm" onClick={reset}>I've saved them</Button>
          </div>
        </div>
      ) : mode === 'setup' && setupData ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <img src={setupData.qrDataUrl} alt="2FA QR code" className="h-40 w-40 rounded-lg border border-slate-200" />
            <div className="text-sm">
              <p className="text-slate-500">Can't scan? Enter this key manually:</p>
              <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 font-mono text-slate-800">{setupData.secret}</code>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-40"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button size="sm" disabled={enable.isPending || code.length !== 6} onClick={() => { setError(null); enable.mutate(); }}>
              {enable.isPending ? 'Verifying…' : 'Verify & enable'}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
          </div>
        </div>
      ) : status.data?.enabled ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <ShieldCheck size={16} /> Two-factor authentication is on
            <span className="text-slate-500">· {status.data.recoveryCodesRemaining} recovery codes left</span>
          </p>
          {showDisable ? (
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="Current code or password"
                type="password"
                autoComplete="off"
                className="w-64"
                value={disableSecret}
                onChange={(e) => setDisableSecret(e.target.value)}
              />
              <Button variant="outline" size="sm" className="text-red-600" disabled={disable.isPending || !disableSecret} onClick={() => { setError(null); disable.mutate(); }}>
                {disable.isPending ? 'Disabling…' : 'Confirm disable'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowDisable(false); setDisableSecret(''); setError(null); }}>Cancel</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="text-red-600" onClick={() => setShowDisable(true)}>Disable two-factor</Button>
          )}
        </div>
      ) : (
        <Button size="sm" disabled={beginSetup.isPending} onClick={() => { setError(null); beginSetup.mutate(); }}>
          {beginSetup.isPending ? 'Starting…' : 'Set up two-factor'}
        </Button>
      )}
    </Card>
  );
};
