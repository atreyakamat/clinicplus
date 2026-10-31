import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Pencil, Archive, RotateCcw, X } from 'lucide-react';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import { errorMessage, inputCls, unwrap } from '../doctors/scheduling';

interface Branch {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  status: string;
  _count?: { users: number; departments: number };
}

const FIELDS: Array<{ key: keyof Branch; label: string; type?: string }> = [
  { key: 'name', label: 'Branch name *' },
  { key: 'code', label: 'Code' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'country', label: 'Country' },
];

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf('timeZone') as string[];
  } catch {
    return ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC'];
  }
})();

export const BranchesSettings = () => {
  const qc = useQueryClient();
  const can = useCan();
  const { user, activeBranchId } = useAuthStore();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Partial<Branch> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: branches, isLoading, error: loadError } = useQuery<Branch[]>({
    queryKey: ['branches', 'settings', showArchived],
    queryFn: async () => unwrap<Branch[]>(await api.get(`/branches${showArchived ? '?includeArchived=true' : ''}`)),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['branches'] });

  const save = useMutation({
    mutationFn: async (b: Partial<Branch>) => {
      const body: Record<string, unknown> = {};
      for (const f of FIELDS) {
        const v = b[f.key];
        if (typeof v === 'string' && v.trim() !== '') body[f.key] = v.trim();
      }
      if (b.timezone) body.timezone = b.timezone;
      return b.id ? api.patch(`/branches/${b.id}`, body) : api.post('/branches', body);
    },
    onSuccess: () => {
      setEditing(null);
      setError(null);
      invalidate();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/branches/${id}`),
    onSuccess: invalidate,
    onError: (e) => alert(errorMessage(e)),
  });

  const restore = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/${id}`, { status: 'ACTIVE' }),
    onSuccess: invalidate,
    onError: (e) => alert(errorMessage(e)),
  });

  const currentBranch = activeBranchId ?? user?.branchId;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Branches"
        description="Locations of your clinic network. Each branch has its own schedule, queue and staff."
        actions={
          <HasPermission permission="branches.manage">
            <Button className="gap-2" onClick={() => { setError(null); setEditing({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); }}>
              <Plus size={16} /> Add branch
            </Button>
          </HasPermission>
        }
      />

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived branches
      </label>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{[1, 2].map((i) => <div key={i} className="h-36 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : loadError ? (
        <div className="p-6 rounded-xl bg-red-50 text-red-700">{errorMessage(loadError, 'Failed to load branches')}</div>
      ) : !branches?.length ? (
        <Card className="text-center py-12 text-slate-500">No branches yet.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {branches.map((b) => (
            <Card key={b.id} className={b.status === 'ARCHIVED' ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-[#1FA971]/10 text-[#1FA971] flex items-center justify-center"><Building2 size={20} /></div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">
                      {b.name} {b.code && <span className="text-xs text-slate-400">({b.code})</span>}
                    </h3>
                    <p className="text-sm text-slate-500 truncate">{[b.address, b.city, b.state, b.country].filter(Boolean).join(', ') || 'No address'}</p>
                    <p className="text-xs text-slate-400 mt-1">{b.timezone || 'Default timezone'} · {b._count?.users ?? 0} staff · {b._count?.departments ?? 0} departments</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {b.id === currentBranch && <span className="text-xs font-medium text-[#1FA971]">Active</span>}
                  {b.status !== 'ACTIVE' && <span className="text-xs font-medium text-slate-500">{b.status}</span>}
                </div>
              </div>
              {can('branches.manage') && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {b.status === 'ARCHIVED' ? (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => restore.mutate(b.id)}><RotateCcw size={14} /> Restore</Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => { setError(null); setEditing(b); }}><Pencil size={14} /> Edit</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-red-600"
                        disabled={archive.isPending}
                        onClick={() => confirm(`Archive branch "${b.name}"? Staff must be moved out first.`) && archive.mutate(b.id)}
                      >
                        <Archive size={14} /> Archive
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editing.id ? 'Edit branch' : 'New branch'}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <form
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}
            >
              {FIELDS.map((f) => (
                <label key={f.key} className="text-sm text-slate-700 flex flex-col gap-1">
                  {f.label}
                  <input
                    type={f.type ?? 'text'}
                    required={f.key === 'name'}
                    className={inputCls}
                    value={(editing[f.key] as string) ?? ''}
                    onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="text-sm text-slate-700 flex flex-col gap-1">
                Timezone
                <select className={inputCls} value={editing.timezone ?? ''} onChange={(e) => setEditing({ ...editing, timezone: e.target.value })}>
                  <option value="">Default</option>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </label>
              {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save branch'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
