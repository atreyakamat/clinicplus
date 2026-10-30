import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Save, X, Archive } from 'lucide-react';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { DAY_NAMES, errorMessage, inputCls, unwrap, unwrapPage } from '../doctors/scheduling';

const TABS = [
  { id: 'services', label: 'Services & prices', permission: 'services.view' },
  { id: 'departments', label: 'Departments', permission: 'departments.view' },
  { id: 'hours', label: 'Working hours', permission: 'services.view' },
  { id: 'holidays', label: 'Holidays', permission: 'services.view' },
];

export const ClinicSetup = () => {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const visible = TABS.filter((t) => can(t.permission));
  const tab = visible.find((t) => t.id === params.get('tab'))?.id ?? visible[0]?.id;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Clinic setup" description="Services and prices, departments, opening hours and holidays." />
      {visible.length === 0 ? (
        <Card className="text-slate-500">You do not have access to clinic setup.</Card>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
            {visible.map((t) => (
              <button
                key={t.id}
                onClick={() => setParams({ tab: t.id })}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-[#1FA971] text-[#1FA971]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'services' && <ServicesTab />}
          {tab === 'departments' && <DepartmentsTab />}
          {tab === 'hours' && <HoursTab />}
          {tab === 'holidays' && <HolidaysTab />}
        </>
      )}
    </div>
  );
};

// --------------------------------------------------------------- services
interface Service {
  id: string;
  name: string;
  description?: string | null;
  duration: number;
  price: string | number;
  departmentId?: string | null;
  status: string;
}

const ServicesTab = () => {
  const qc = useQueryClient();
  const can = useCan();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['clinic-services', search],
    queryFn: async () => unwrapPage<Service>(await api.get(`/clinic-settings/services?includeInactive=true&limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`)),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    enabled: can('departments.view'),
    queryFn: async () => unwrap<Array<{ id: string; name: string }>>(await api.get('/departments')),
  });

  const save = useMutation({
    mutationFn: (s: Partial<Service>) => {
      const body = {
        name: s.name,
        description: s.description || undefined,
        duration: Number(s.duration) || 15,
        price: Number(s.price),
        departmentId: s.departmentId || (s.id ? null : undefined),
        ...(s.id ? { status: s.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE' } : {}),
      };
      return s.id ? api.patch(`/clinic-settings/services/${s.id}`, body) : api.post('/clinic-settings/services', body);
    },
    onSuccess: () => { setEditing(null); setError(null); qc.invalidateQueries({ queryKey: ['clinic-services'] }); },
    onError: (e) => setError(errorMessage(e)),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/clinic-settings/services/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-services'] }),
    onError: (e) => alert(errorMessage(e)),
  });

  const depName = (id?: string | null) => departments?.find((d) => d.id === id)?.name ?? '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input className={`${inputCls} max-w-xs`} placeholder="Search services…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <HasPermission permission="services.manage">
          <Button className="gap-2" onClick={() => { setError(null); setEditing({ duration: 15, price: 0 }); }}><Plus size={16} /> Add service</Button>
        </HasPermission>
      </div>
      {isLoading ? (
        <div className="h-40 rounded-xl bg-slate-100 animate-pulse" />
      ) : loadError ? (
        <div className="p-4 rounded-xl bg-red-50 text-red-700">{errorMessage(loadError)}</div>
      ) : !data?.items.length ? (
        <Card className="text-center text-slate-500 py-10">No services yet. Add consultations, procedures and tests with their prices.</Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr><th className="px-4 py-3">Service</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((s) => (
                <tr key={s.id} className={s.status !== 'ACTIVE' ? 'text-slate-400' : ''}>
                  <td className="px-4 py-3"><div className="font-medium">{s.name}</div>{s.description && <div className="text-xs text-slate-500">{s.description}</div>}{s.status !== 'ACTIVE' && <span className="text-xs">Inactive</span>}</td>
                  <td className="px-4 py-3">{depName(s.departmentId)}</td>
                  <td className="px-4 py-3">{s.duration} min</td>
                  <td className="px-4 py-3 text-right font-medium">{Number(s.price).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {can('services.manage') && (
                      <>
                        <button className="p-1 text-slate-500 hover:text-slate-900" title="Edit" onClick={() => { setError(null); setEditing(s); }}><Pencil size={16} /></button>
                        <button className="p-1 text-slate-500 hover:text-red-600" title="Archive" onClick={() => confirm(`Archive "${s.name}"?`) && archive.mutate(s.id)}><Archive size={16} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {editing && (
        <Modal title={editing.id ? 'Edit service' : 'New service'} onClose={() => setEditing(null)}>
          <form className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
            <Field label="Name *" className="sm:col-span-2"><input required className={inputCls} value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Price *"><input required type="number" min={0} step="0.01" className={inputCls} value={editing.price ?? ''} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></Field>
            <Field label="Duration (minutes)"><input type="number" min={5} max={600} className={inputCls} value={editing.duration ?? 15} onChange={(e) => setEditing({ ...editing, duration: Number(e.target.value) })} /></Field>
            {departments && (
              <Field label="Department">
                <select className={inputCls} value={editing.departmentId ?? ''} onChange={(e) => setEditing({ ...editing, departmentId: e.target.value || null })}>
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            )}
            {editing.id && (
              <Field label="Status">
                <select className={inputCls} value={editing.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
                </select>
              </Field>
            )}
            <Field label="Description" className="sm:col-span-2"><textarea className={`${inputCls} h-20 py-2`} value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save</Button></div>
          </form>
        </Modal>
      )}
    </div>
  );
};

// ------------------------------------------------------------ departments
const DepartmentsTab = () => {
  const qc = useQueryClient();
  const can = useCan();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => unwrap<Array<{ id: string; name: string; description?: string | null }>>(await api.get('/departments')),
  });
  const create = useMutation({
    mutationFn: () => api.post('/departments', { name, description: description || undefined }),
    onSuccess: () => { setName(''); setDescription(''); setError(null); qc.invalidateQueries({ queryKey: ['departments'] }); },
    onError: (e) => setError(errorMessage(e)),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
    onError: (e) => alert(errorMessage(e)),
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/departments/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
    onError: (e) => alert(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Departments belong to the currently selected branch.</p>
      {can('departments.manage') && (
        <Card>
          <form className="flex flex-col sm:flex-row gap-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <input required className={inputCls} placeholder="Department name, e.g. Pediatrics" value={name} onChange={(e) => setName(e.target.value)} />
            <input className={inputCls} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Button type="submit" className="gap-2 shrink-0" disabled={create.isPending}><Plus size={16} /> Add</Button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Card>
      )}
      {isLoading ? <div className="h-32 rounded-xl bg-slate-100 animate-pulse" /> : loadError ? (
        <div className="p-4 rounded-xl bg-red-50 text-red-700">{errorMessage(loadError)}</div>
      ) : !data?.length ? (
        <Card className="text-center text-slate-500 py-10">No departments in this branch yet.</Card>
      ) : (
        <Card className="p-0 divide-y divide-slate-100">
          {data.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div><div className="font-medium">{d.name}</div>{d.description && <div className="text-xs text-slate-500">{d.description}</div>}</div>
              {can('departments.manage') && (
                <div className="flex gap-1 shrink-0">
                  <button className="p-1 text-slate-500 hover:text-slate-900" title="Rename" onClick={() => { const n = prompt('New name', d.name); if (n && n.trim()) rename.mutate({ id: d.id, name: n.trim() }); }}><Pencil size={16} /></button>
                  <button className="p-1 text-slate-500 hover:text-red-600" title="Archive" onClick={() => confirm(`Archive "${d.name}"?`) && archive.mutate(d.id)}><Archive size={16} /></button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

// ---------------------------------------------------------- working hours
interface DayRow { dayOfWeek: number; open: boolean; openTime: string; closeTime: string; breakStart: string; breakEnd: string }

export const HoursEditor = ({ onSaved, compact }: { onSaved?: () => void; compact?: boolean }) => {
  const qc = useQueryClient();
  const can = useCan();
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['working-hours'],
    queryFn: async () => unwrap<Array<{ dayOfWeek: number; openTime: string; closeTime: string; breakStart?: string; breakEnd?: string }>>(await api.get('/clinic-settings/working-hours')),
  });
  useEffect(() => {
    if (!data) return;
    const configured = data.length > 0;
    setRows(
      DAY_NAMES.map((_, d) => {
        const h = data.find((x) => x.dayOfWeek === d);
        return {
          dayOfWeek: d,
          open: configured ? !!h : d !== 0,
          openTime: h?.openTime ?? '09:00',
          closeTime: h?.closeTime ?? '18:00',
          breakStart: h?.breakStart ?? '',
          breakEnd: h?.breakEnd ?? '',
        };
      }),
    );
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.put('/clinic-settings/working-hours', {
        days: rows!.map((r) =>
          r.open
            ? { dayOfWeek: r.dayOfWeek, openTime: r.openTime, closeTime: r.closeTime, ...(r.breakStart && r.breakEnd ? { breakStart: r.breakStart, breakEnd: r.breakEnd } : {}) }
            : { dayOfWeek: r.dayOfWeek, closed: true },
        ),
      }),
    onSuccess: () => { setMsg({ ok: true, text: 'Working hours saved' }); qc.invalidateQueries({ queryKey: ['working-hours'] }); onSaved?.(); },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });

  if (isLoading || !rows) return <div className="h-40 rounded-xl bg-slate-100 animate-pulse" />;
  if (error) return <div className="p-4 rounded-xl bg-red-50 text-red-700">{errorMessage(error)}</div>;
  const editable = can('services.manage');
  const set = (i: number, patch: Partial<DayRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {!compact && data && data.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">No hours saved yet — bookings are currently not restricted by clinic hours. Save to start enforcing them.</p>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.dayOfWeek} className="grid grid-cols-2 sm:grid-cols-[120px_90px_1fr_1fr] gap-2 items-center rounded-lg border border-slate-200 bg-white p-3">
            <div className="font-medium text-sm">{DAY_NAMES[r.dayOfWeek]}</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={r.open} onChange={(e) => set(i, { open: e.target.checked })} /> Open</label>
            {r.open ? (
              <>
                <div className="flex items-center gap-1 text-sm"><input type="time" disabled={!editable} className={inputCls} value={r.openTime} onChange={(e) => set(i, { openTime: e.target.value })} /> – <input type="time" disabled={!editable} className={inputCls} value={r.closeTime} onChange={(e) => set(i, { closeTime: e.target.value })} /></div>
                <div className="flex items-center gap-1 text-sm"><span className="text-xs text-slate-500 shrink-0">Break</span><input type="time" disabled={!editable} className={inputCls} value={r.breakStart} onChange={(e) => set(i, { breakStart: e.target.value })} /> – <input type="time" disabled={!editable} className={inputCls} value={r.breakEnd} onChange={(e) => set(i, { breakEnd: e.target.value })} /></div>
              </>
            ) : (
              <div className="col-span-2 text-sm text-slate-400">Closed</div>
            )}
          </div>
        ))}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
      {editable && <Button className="gap-2" onClick={() => save.mutate()} disabled={save.isPending}><Save size={16} /> {save.isPending ? 'Saving…' : 'Save working hours'}</Button>}
    </div>
  );
};

const HoursTab = () => (
  <div className="space-y-2">
    <p className="text-sm text-slate-500">Opening hours of the currently selected branch. Bookings outside these hours are rejected unless overridden.</p>
    <HoursEditor />
  </div>
);

// --------------------------------------------------------------- holidays
const HolidaysTab = () => {
  const qc = useQueryClient();
  const can = useCan();
  const [form, setForm] = useState({ name: '', date: '', description: '' });
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['holidays'],
    queryFn: async () => unwrap<Array<{ id: string; name: string; date: string; description?: string | null }>>(await api.get('/clinic-settings/holidays')),
  });
  const create = useMutation({
    mutationFn: () => api.post('/clinic-settings/holidays', { name: form.name, date: form.date, description: form.description || undefined }),
    onSuccess: () => { setForm({ name: '', date: '', description: '' }); setError(null); qc.invalidateQueries({ queryKey: ['holidays'] }); },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/clinic-settings/holidays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
    onError: (e) => alert(errorMessage(e)),
  });
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data ?? []).filter((h) => h.date.slice(0, 10) >= today);
  const past = (data ?? []).filter((h) => h.date.slice(0, 10) < today);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Holidays apply to all branches. No appointments can be booked on a holiday.</p>
      {can('services.manage') && (
        <Card>
          <form className="grid grid-cols-1 sm:grid-cols-[1fr_180px_1fr_auto] gap-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <input required className={inputCls} placeholder="Holiday name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input required type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <input className={inputCls} placeholder="Note (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Button type="submit" className="gap-2" disabled={create.isPending}><Plus size={16} /> Add</Button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Card>
      )}
      {isLoading ? <div className="h-32 rounded-xl bg-slate-100 animate-pulse" /> : loadError ? (
        <div className="p-4 rounded-xl bg-red-50 text-red-700">{errorMessage(loadError)}</div>
      ) : !data?.length ? (
        <Card className="text-center text-slate-500 py-10">No holidays configured.</Card>
      ) : (
        [{ label: 'Upcoming', list: upcoming }, { label: 'Past', list: past }].map((g) => g.list.length > 0 && (
          <div key={g.label}>
            <h3 className="text-sm font-semibold text-slate-600 mb-2">{g.label}</h3>
            <Card className="p-0 divide-y divide-slate-100">
              {g.list.map((h) => (
                <div key={h.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-medium">{h.name}</div>
                    <div className="text-xs text-slate-500">{new Date(h.date).toLocaleDateString([], { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{h.description ? ` · ${h.description}` : ''}</div>
                  </div>
                  {can('services.manage') && <button className="p-1 text-slate-500 hover:text-red-600" title="Delete" onClick={() => confirm(`Delete "${h.name}"?`) && remove.mutate(h.id)}><Trash2 size={16} /></button>}
                </div>
              ))}
            </Card>
          </div>
        ))
      )}
    </div>
  );
};

// ---------------------------------------------------------------- shared
export const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
    <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>
);

export const Field = ({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) => (
  <label className={`text-sm text-slate-700 flex flex-col gap-1 ${className}`}>{label}{children}</label>
);
