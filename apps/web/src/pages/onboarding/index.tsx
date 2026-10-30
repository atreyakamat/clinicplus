import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, Check, Clock, ArrowRight, Users, ListChecks, Plus, Trash2 } from 'lucide-react';
import { Button, Card } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import { HoursEditor } from '../settings/ClinicSetup';
import { AvailabilityEditor } from '../doctors/AvailabilityEditor';
import { type AvailabilityBlock, type Doctor, errorMessage, inputCls, unwrap, unwrapPage } from '../doctors/scheduling';

const steps = [
  { id: 1, title: 'Clinic', icon: Building },
  { id: 2, title: 'Hours', icon: Clock },
  { id: 3, title: 'Services', icon: ListChecks },
  { id: 4, title: 'Doctors', icon: Users },
  { id: 5, title: 'Go live', icon: Check },
];

/**
 * First-run setup. Every step writes real configuration through the API:
 * organization + branch profile, branch working hours, the service catalog and
 * each doctor's weekly availability.
 */
export const OnboardingWizard = () => {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">Set up your clinic</h1>
          <p className="text-slate-500">A few minutes now and you can start booking patients.</p>
        </div>

        <div className="flex justify-between items-center max-w-2xl mx-auto">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            const done = step > s.id;
            const active = step === s.id;
            return (
              <React.Fragment key={s.id}>
                <button className="flex flex-col items-center gap-2" onClick={() => setStep(s.id)}>
                  <div className={`h-11 w-11 rounded-full flex items-center justify-center border-2 ${done ? 'bg-[#1FA971] border-[#1FA971] text-white' : active ? 'border-[#1FA971] text-[#1FA971] bg-white' : 'border-slate-200 text-slate-400 bg-white'}`}>
                    {done ? <Check size={18} /> : <Icon size={18} />}
                  </div>
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${active ? 'text-[#1FA971]' : 'text-slate-400'}`}>{s.title}</span>
                </button>
                {idx < steps.length - 1 && <div className={`h-0.5 flex-1 mx-2 ${step > s.id ? 'bg-[#1FA971]' : 'bg-slate-200'}`} />}
              </React.Fragment>
            );
          })}
        </div>

        <Card className="p-6 md:p-8 shadow-xl border-none">
          {step === 1 && <ClinicStep onNext={() => setStep(2)} />}
          {step === 2 && <StepShell title="Opening hours" subtitle="When is this branch open? Appointments can only be booked inside these hours." onBack={() => setStep(1)} onNext={() => setStep(3)}><HoursEditor compact /></StepShell>}
          {step === 3 && <StepShell title="Services & prices" subtitle="What you offer and what it costs. Used for booking and billing." onBack={() => setStep(2)} onNext={() => setStep(4)}><ServicesStep /></StepShell>}
          {step === 4 && <StepShell title="Doctor schedules" subtitle="Set each doctor's weekly availability. Patients can only be booked into these slots." onBack={() => setStep(3)} onNext={() => setStep(5)}><DoctorsStep /></StepShell>}
          {step === 5 && <GoLive onBack={() => setStep(4)} onFinish={() => navigate('/')} />}
        </Card>
      </div>
    </div>
  );
};

const StepShell = ({ title, subtitle, children, onBack, onNext }: { title: string; subtitle: string; children: React.ReactNode; onBack: () => void; onNext: () => void }) => (
  <div className="space-y-6">
    <div><h2 className="text-xl font-bold text-slate-900">{title}</h2><p className="text-sm text-slate-500">{subtitle}</p></div>
    {children}
    <div className="flex justify-between pt-6 border-t border-slate-100">
      <Button variant="ghost" onClick={onBack}>Back</Button>
      <Button className="gap-2" onClick={onNext}>Continue <ArrowRight size={16} /></Button>
    </div>
  </div>
);

const TIMEZONES: string[] = (() => {
  try { return (Intl as any).supportedValuesOf('timeZone') as string[]; } catch { return ['Asia/Kolkata', 'UTC']; }
})();

const ClinicStep = ({ onNext }: { onNext: () => void }) => {
  const can = useCan();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [org, setOrg] = useState({ name: '', email: '', phone: '', website: '' });
  const [branch, setBranch] = useState({ name: '', address: '', city: '', state: '', country: '', phone: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const [error, setError] = useState<string | null>(null);

  const { data: orgData } = useQuery({ queryKey: ['my-organization'], queryFn: async () => unwrap<any>(await api.get('/organizations/current')) });
  const { data: branchData } = useQuery({
    queryKey: ['branches', user?.branchId],
    enabled: !!user?.branchId && can('branches.view'),
    queryFn: async () => unwrap<any>(await api.get(`/branches/${user!.branchId}`)),
  });
  useEffect(() => { if (orgData) setOrg({ name: orgData.name ?? '', email: orgData.email ?? '', phone: orgData.phone ?? '', website: orgData.website ?? '' }); }, [orgData]);
  useEffect(() => {
    if (branchData) setBranch((b) => ({ ...b, ...Object.fromEntries(Object.entries(branchData).filter(([k, v]) => k in b && typeof v === 'string' && v)) }));
  }, [branchData]);

  const save = useMutation({
    mutationFn: async () => {
      const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, v.trim()]));
      if (can('organizations.update')) await api.patch('/organizations/current', clean(org));
      if (can('branches.manage') && user?.branchId) await api.patch(`/branches/${user.branchId}`, clean(branch));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-organization'] }); qc.invalidateQueries({ queryKey: ['branches'] }); onNext(); },
    onError: (e) => setError(errorMessage(e)),
  });

  const field = (label: string, value: string, onChange: (v: string) => void, opts: { required?: boolean; type?: string } = {}) => (
    <label className="text-sm text-slate-700 flex flex-col gap-1">{label}<input className={inputCls} type={opts.type ?? 'text'} required={opts.required} value={value} onChange={(e) => onChange(e.target.value)} /></label>
  );

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div><h2 className="text-xl font-bold text-slate-900">Clinic details</h2><p className="text-sm text-slate-500">Shown on prescriptions, invoices and patient messages.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {field('Clinic name *', org.name, (v) => setOrg({ ...org, name: v }), { required: true })}
        {field('Business email', org.email, (v) => setOrg({ ...org, email: v }), { type: 'email' })}
        {field('Phone', org.phone, (v) => setOrg({ ...org, phone: v }))}
        {field('Website', org.website, (v) => setOrg({ ...org, website: v }))}
      </div>
      {can('branches.manage') && (
        <>
          <h3 className="font-semibold text-slate-800 pt-2">Main branch</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('Branch name *', branch.name, (v) => setBranch({ ...branch, name: v }), { required: true })}
            {field('Branch phone', branch.phone, (v) => setBranch({ ...branch, phone: v }))}
            {field('Address', branch.address, (v) => setBranch({ ...branch, address: v }))}
            {field('City', branch.city, (v) => setBranch({ ...branch, city: v }))}
            {field('State', branch.state, (v) => setBranch({ ...branch, state: v }))}
            {field('Country', branch.country, (v) => setBranch({ ...branch, country: v }))}
            <label className="text-sm text-slate-700 flex flex-col gap-1">Timezone
              <select className={inputCls} value={branch.timezone} onChange={(e) => setBranch({ ...branch, timezone: e.target.value })}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </label>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end pt-6 border-t border-slate-100">
        <Button type="submit" className="gap-2" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save & continue'} <ArrowRight size={16} /></Button>
      </div>
    </form>
  );
};

const SUGGESTED = [
  { name: 'General consultation', duration: 15, price: 500 },
  { name: 'Follow-up consultation', duration: 10, price: 300 },
  { name: 'Specialist consultation', duration: 20, price: 800 },
];

const ServicesStep = () => {
  const qc = useQueryClient();
  const can = useCan();
  const [rows, setRows] = useState(SUGGESTED.map((s) => ({ ...s, price: String(s.price), duration: String(s.duration) })));
  const [error, setError] = useState<string | null>(null);
  const { data: existing } = useQuery({
    queryKey: ['clinic-services', 'onboarding'],
    queryFn: async () => unwrapPage<{ id: string; name: string; duration: number; price: string }>(await api.get('/clinic-settings/services?limit=200')).items,
  });
  const create = useMutation({
    mutationFn: async () => {
      const failures: string[] = [];
      for (const r of rows.filter((r) => r.name.trim())) {
        try {
          await api.post('/clinic-settings/services', { name: r.name.trim(), duration: Number(r.duration) || 15, price: Number(r.price) || 0 });
        } catch (e) {
          failures.push(`${r.name}: ${errorMessage(e)}`);
        }
      }
      if (failures.length) throw new Error(failures.join('; '));
    },
    onSuccess: () => { setRows([]); setError(null); qc.invalidateQueries({ queryKey: ['clinic-services'] }); },
    onError: (e) => { setError(errorMessage(e)); qc.invalidateQueries({ queryKey: ['clinic-services'] }); },
  });

  if (!can('services.manage')) return <p className="text-sm text-slate-500">You do not have permission to manage services.</p>;
  return (
    <div className="space-y-4">
      {existing && existing.length > 0 && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {existing.length} service(s) saved: {existing.map((s) => `${s.name} (${Number(s.price).toFixed(2)})`).join(', ')}
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_110px_auto] gap-2 items-center">
            <input className={inputCls} placeholder="Service name" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className={inputCls} type="number" min={5} placeholder="Min" value={r.duration} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, duration: e.target.value } : x)))} />
            <input className={inputCls} type="number" min={0} step="0.01" placeholder="Price" value={r.price} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
            <button className="p-2 text-slate-400 hover:text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="gap-1" onClick={() => setRows([...rows, { name: '', duration: '15', price: '0' }])}><Plus size={14} /> Add row</Button>
        {rows.length > 0 && <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? 'Saving…' : `Save ${rows.filter((r) => r.name.trim()).length} service(s)`}</Button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

const DoctorsStep = () => {
  const can = useCan();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { data: doctors, isLoading } = useQuery<Doctor[]>({ queryKey: ['doctors', ''], queryFn: async () => unwrap<Doctor[]>(await api.get('/doctors')) });
  const { data: hours } = useQuery({ queryKey: ['working-hours'], queryFn: async () => unwrap<Array<{ dayOfWeek: number; openTime: string; closeTime: string; breakStart?: string | null; breakEnd?: string | null }>>(await api.get('/clinic-settings/working-hours')) });

  const fromHours = (): AvailabilityBlock[] =>
    (hours ?? []).flatMap((h) =>
      h.breakStart && h.breakEnd
        ? [
            { dayOfWeek: h.dayOfWeek, startTime: h.openTime, endTime: h.breakStart, slotDuration: 15 },
            { dayOfWeek: h.dayOfWeek, startTime: h.breakEnd, endTime: h.closeTime, slotDuration: 15 },
          ]
        : [{ dayOfWeek: h.dayOfWeek, startTime: h.openTime, endTime: h.closeTime, slotDuration: 15 }],
    );

  const applyAll = useMutation({
    mutationFn: async () => {
      const blocks = fromHours();
      if (!blocks.length) throw new Error('Save the clinic opening hours first (previous step).');
      const targets = (doctors ?? []).filter((d) => !(d.doctorAvailability?.length));
      for (const d of targets) await api.put(`/doctors/${d.id}/availability`, { blocks });
      return targets.length;
    },
    onSuccess: (n) => { setMsg(`Applied clinic hours (15-minute slots) to ${n} doctor(s) without a schedule.`); qc.invalidateQueries({ queryKey: ['doctors'] }); },
    onError: (e) => setMsg(errorMessage(e)),
  });

  if (isLoading) return <div className="h-32 rounded-xl bg-slate-100 animate-pulse" />;
  if (!doctors?.length) {
    return (
      <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
        No doctors yet. Invite doctors from <a className="underline" href="/settings/staff">Settings → Staff</a>; after they accept, set their schedules on the Doctors page.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {can('doctors.manage') && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => applyAll.mutate()} disabled={applyAll.isPending}>Use clinic hours for doctors without a schedule</Button>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      )}
      {doctors.map((d) => {
        const editable = can('doctors.manage') || (can('doctors.update_own') && me?.id === d.id);
        const count = d.doctorAvailability?.length ?? 0;
        return (
          <div key={d.id} className="rounded-lg border border-slate-200">
            <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setOpen(open === d.id ? null : d.id)}>
              <span className="font-medium">Dr. {d.firstName} {d.lastName} <span className="text-xs text-slate-500">{d.specialization}</span></span>
              <span className={`text-xs ${count ? 'text-green-700' : 'text-amber-700'}`}>{count ? `${count} time block(s)` : 'No schedule'}</span>
            </button>
            {open === d.id && (
              <div className="border-t border-slate-100 p-4">
                <AvailabilityEditor doctorId={d.id} initial={d.doctorAvailability ?? []} editable={editable} onSaved={() => qc.invalidateQueries({ queryKey: ['doctors'] })} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const GoLive = ({ onBack, onFinish }: { onBack: () => void; onFinish: () => void }) => {
  const { data: hours } = useQuery({ queryKey: ['working-hours'], queryFn: async () => unwrap<unknown[]>(await api.get('/clinic-settings/working-hours')) });
  const { data: services } = useQuery({ queryKey: ['clinic-services', 'onboarding'], queryFn: async () => unwrapPage<unknown>(await api.get('/clinic-settings/services?limit=200')).items });
  const { data: doctors } = useQuery<Doctor[]>({ queryKey: ['doctors', ''], queryFn: async () => unwrap<Doctor[]>(await api.get('/doctors')) });
  const scheduled = (doctors ?? []).filter((d) => d.doctorAvailability?.length).length;
  const checks = [
    { ok: (hours?.length ?? 0) > 0, text: `Opening hours: ${hours?.length ?? 0} day(s) open` },
    { ok: (services?.length ?? 0) > 0, text: `Services: ${services?.length ?? 0} in the catalog` },
    { ok: scheduled > 0, text: `Doctors with a schedule: ${scheduled} of ${doctors?.length ?? 0}` },
  ];
  return (
    <div className="space-y-6 py-4">
      <div className="text-center space-y-2">
        <div className="h-16 w-16 bg-green-100 text-[#1FA971] rounded-full flex items-center justify-center mx-auto"><Check size={32} /></div>
        <h2 className="text-2xl font-bold text-slate-900">Ready to go live</h2>
      </div>
      <ul className="max-w-md mx-auto space-y-2">
        {checks.map((c) => (
          <li key={c.text} className={`flex items-center gap-2 text-sm rounded-lg p-3 ${c.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
            {c.ok ? <Check size={16} /> : <span className="font-bold">!</span>} {c.text}
          </li>
        ))}
      </ul>
      <div className="flex justify-between pt-6 border-t border-slate-100">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button className="gap-2" onClick={onFinish}>Go to dashboard <ArrowRight size={16} /></Button>
      </div>
    </div>
  );
};
