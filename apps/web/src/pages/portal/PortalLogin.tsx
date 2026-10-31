import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartPulse, Loader2 } from 'lucide-react';
import { portalAuthApi, portalErrorMessage } from './portal.api';
import { usePortalAuth } from './portal.store';

type Mode = 'password' | 'otp';

export function PortalLogin() {
  const navigate = useNavigate();
  const { setSession, clinicSlug: savedSlug } = usePortalAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [clinicSlug, setClinicSlug] = useState(savedSlug ?? '');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await portalAuthApi.login({ clinicSlug: clinicSlug.trim(), identifier: identifier.trim(), password });
      setSession(session, clinicSlug.trim());
      navigate('/portal', { replace: true });
    } catch (err) {
      setError(portalErrorMessage(err, 'Invalid login details.'));
    } finally {
      setBusy(false);
    }
  };

  const onRequestOtp = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await portalAuthApi.requestOtp({ clinicSlug: clinicSlug.trim(), identifier: identifier.trim() });
      setOtpSent(true);
      setInfo(res?.message ?? 'If the details match an account, a code has been sent.');
    } catch (err) {
      setError(portalErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await portalAuthApi.verifyOtp({ clinicSlug: clinicSlug.trim(), identifier: identifier.trim(), code: code.trim() });
      setSession(session, clinicSlug.trim());
      navigate('/portal', { replace: true });
    } catch (err) {
      setError(portalErrorMessage(err, 'Invalid or expired code.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-clinic-green/10 flex items-center justify-center mb-3">
              <HeartPulse className="w-6 h-6 text-clinic-green" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Patient Portal</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to view your care and bookings</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-5">
              {(['password', 'otp'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); setInfo(null); }}
                  className={`text-sm font-medium py-2 rounded-lg transition ${mode === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                >
                  {m === 'password' ? 'Password' : 'One-time code'}
                </button>
              ))}
            </div>

            <label className="block text-xs font-medium text-slate-600 mb-1">Clinic code</label>
            <input
              value={clinicSlug}
              onChange={(e) => setClinicSlug(e.target.value)}
              placeholder="your-clinic"
              autoCapitalize="none"
              className="w-full mb-3 rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-clinic-green/40 focus:border-clinic-green outline-none"
            />

            <label className="block text-xs font-medium text-slate-600 mb-1">Phone or email</label>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com"
              autoCapitalize="none"
              className="w-full mb-3 rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-clinic-green/40 focus:border-clinic-green outline-none"
            />

            {mode === 'password' ? (
              <form onSubmit={onPasswordLogin}>
                <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full mb-4 rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-clinic-green/40 focus:border-clinic-green outline-none"
                />
                <SubmitButton busy={busy} label="Sign in" disabled={!clinicSlug || !identifier || !password} />
              </form>
            ) : (
              <form onSubmit={onVerifyOtp}>
                {otpSent && (
                  <>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Enter the code we sent</label>
                    <input
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit code"
                      className="w-full mb-4 rounded-xl border border-slate-300 px-3 py-2.5 text-sm tracking-widest text-center focus:ring-2 focus:ring-clinic-green/40 focus:border-clinic-green outline-none"
                    />
                    <SubmitButton busy={busy} label="Verify & sign in" disabled={code.length < 4} />
                    <button type="button" onClick={onRequestOtp} disabled={busy} className="w-full mt-2 text-sm text-clinic-green font-medium py-1">
                      Resend code
                    </button>
                  </>
                )}
                {!otpSent && (
                  <button
                    type="button"
                    onClick={onRequestOtp}
                    disabled={busy || !clinicSlug || !identifier}
                    className="w-full flex items-center justify-center gap-2 bg-clinic-green text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
                  >
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send me a code
                  </button>
                )}
              </form>
            )}

            {info && <p className="mt-3 text-xs text-slate-500 text-center">{info}</p>}
            {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">Having trouble? Contact your clinic's front desk.</p>
        </div>
      </div>
    </div>
  );
}

function SubmitButton({ busy, label, disabled }: { busy: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="w-full flex items-center justify-center gap-2 bg-clinic-green text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
    >
      {busy && <Loader2 className="w-4 h-4 animate-spin" />} {label}
    </button>
  );
}
