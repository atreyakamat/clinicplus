import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { portalApi, portalErrorMessage, unwrap } from './portal.api';
import { usePortalAuth } from './portal.store';
import { Card, PageTitle, QueryState } from './portal.ui';

export function PortalProfile() {
  const setTokens = usePortalAuth((s) => s.setTokens);
  const me = useQuery({ queryKey: ['portal', 'me'], queryFn: () => portalApi.get('/me').then(unwrap) });

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferredChannel, setPreferredChannel] = useState('');
  const [city, setCity] = useState('');
  const [line1, setLine1] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me.data) {
      setPhone(me.data.phone ?? '');
      setEmail(me.data.email ?? '');
      setPreferredChannel(me.data.preferredChannel ?? '');
      setCity(me.data.address?.city ?? '');
      setLine1(me.data.address?.addressLine1 ?? '');
    }
  }, [me.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: any = { phone, email: email || undefined, preferredChannel: preferredChannel || undefined };
      if (city || line1) body.address = { city, addressLine1: line1 };
      const updated = await portalApi.patch('/me', body).then(unwrap);
      if (updated) setTokens({ accessToken: usePortalAuth.getState().token!, patient: { ...usePortalAuth.getState().patient!, phone: updated.phone, email: updated.email } });
      setSaved(true);
    } catch (err) {
      setError(portalErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageTitle title="My profile" subtitle="Update your contact details" />
      <QueryState isLoading={me.isLoading} error={me.error}>
        <Card className="p-5">
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-900">{me.data?.firstName} {me.data?.lastName}</p>
            {me.data?.patientCode && <p className="text-xs text-slate-500">ID: {me.data.patientCode}</p>}
          </div>
          <form onSubmit={save} className="space-y-3">
            <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
            <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoCapitalize="none" /></Field>
            <Field label="Preferred channel">
              <select value={preferredChannel} onChange={(e) => setPreferredChannel(e.target.value)} className={inputCls}>
                <option value="">No preference</option>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </select>
            </Field>
            <Field label="Address line"><input value={line1} onChange={(e) => setLine1(e.target.value)} className={inputCls} /></Field>
            <Field label="City"><input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} /></Field>

            <button type="submit" disabled={saving} className="w-full flex items-center justify-center gap-2 bg-clinic-green text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
            </button>
            {saved && <p className="text-sm text-emerald-600 text-center">Saved.</p>}
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          </form>
        </Card>
      </QueryState>
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-clinic-green/40 focus:border-clinic-green outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
