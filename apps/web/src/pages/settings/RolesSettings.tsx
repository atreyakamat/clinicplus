import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';
import { useAuthStore } from '../../app/store/auth.store';
import { useCan } from '../../app/components/HasPermission';
import { normalizePermission } from '../../app/lib/access';

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

interface Permission {
  id: string;
  key: string;
  module: string;
  action: string;
  description: string | null;
}

const humanize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Groups permission keys by module for display. */
function groupByModule(perms: Permission[]) {
  const groups = new Map<string, Permission[]>();
  for (const p of perms) {
    const list = groups.get(p.module) ?? [];
    list.push(p);
    groups.set(p.module, list);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

interface Draft {
  id?: string;
  name: string;
  description: string;
  permissions: Set<string>;
}

export const RolesSettings = () => {
  const queryClient = useQueryClient();
  const can = useCan();
  const user = useAuthStore((s) => s.user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => unwrap<Role[]>(await api.get('/roles')) });
  const catalog = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => unwrap<Permission[]>(await api.get('/permissions')),
    enabled: can('permissions.view'),
  });

  const selected = roles.data?.find((r) => r.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedId && roles.data?.length) setSelectedId(roles.data[0].id);
  }, [roles.data, selectedId]);

  // Mirrors the API anti-escalation rule so the editor never offers what the server will reject.
  const held = useMemo(() => new Set((user?.permissions ?? []).map(normalizePermission)), [user?.permissions]);
  const privileged = (user?.roles ?? []).some((r) => r === 'Organization Owner' || r === 'Super Admin');
  const canGrant = (key: string) => held.has(key) || (privileged && key !== 'admin.view');

  const catalogForDisplay: Permission[] = useMemo(() => {
    if (catalog.data?.length) return catalog.data;
    // Without permissions.view, build the list from the role itself.
    const keys = new Set([...(selected?.permissions ?? []), ...(draft ? Array.from(draft.permissions) : [])]);
    return Array.from(keys).map((key) => {
      const [module, action] = key.split('.');
      return { id: key, key, module, action, description: null };
    });
  }, [catalog.data, selected, draft]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roles'] });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { name: d.name.trim(), description: d.description.trim() || undefined, permissions: Array.from(d.permissions) };
      return unwrap<Role>(d.id ? await api.patch(`/roles/${d.id}`, body) : await api.post('/roles', body));
    },
    onSuccess: (role) => {
      setNotice({ ok: true, text: `Role "${role.name}" saved. Changes apply to its users immediately.` });
      setDraft(null);
      setSelectedId(role.id);
      invalidate();
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      setNotice({ ok: true, text: 'Role deleted.' });
      setSelectedId(null);
      invalidate();
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err) }),
  });

  const startCreate = () => {
    setNotice(null);
    setDraft({ name: '', description: '', permissions: new Set() });
  };
  const startEdit = (r: Role) => {
    setNotice(null);
    setDraft({ id: r.id, name: r.name, description: r.description ?? '', permissions: new Set(r.permissions) });
  };
  const toggle = (key: string) =>
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.permissions);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...d, permissions: next };
    });
  const toggleModule = (keys: string[], on: boolean) =>
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.permissions);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return { ...d, permissions: next };
    });

  if (roles.isLoading) return <div className="p-6 text-sm text-slate-500">Loading roles…</div>;
  if (roles.error) return <div className="p-6 text-sm text-red-600">{apiErrorMessage(roles.error)}</div>;

  const showing: Role | null = draft ? null : selected;
  const editingKeys = draft ? draft.permissions : new Set(showing?.permissions ?? []);
  const groups = groupByModule(
    draft ? catalogForDisplay : catalogForDisplay.filter((p) => editingKeys.has(p.key)),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Roles & permissions" description="Built-in roles follow the ClinicPlus access matrix and cannot be changed. Create custom roles for anything else.">
        {can('roles.create') && (
          <Button className="gap-2" onClick={startCreate}>
            <Plus size={16} /> New custom role
          </Button>
        )}
      </PageHeader>

      {notice && (
        <div className={`rounded-md p-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{notice.text}</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden p-0 lg:col-span-1">
          <ul className="divide-y">
            {roles.data?.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setSelectedId(r.id);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 ${selectedId === r.id && !draft ? 'bg-[#1FA971]/5' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{r.name}</span>
                    <span className="text-xs text-slate-500">
                      {r.permissions.length} permissions · {r.userCount} user{r.userCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  {r.isSystem ? (
                    <Badge className="shrink-0 border-slate-200 bg-slate-50 text-slate-600"><Lock size={10} className="mr-1 inline" />Built-in</Badge>
                  ) : (
                    <Badge className="shrink-0 border-emerald-100 bg-emerald-50 text-emerald-700">Custom</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6 lg:col-span-2">
          {draft ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(draft);
              }}
              className="space-y-5"
            >
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <ShieldCheck size={18} className="text-[#1FA971]" /> {draft.id ? `Edit ${draft.name}` : 'New custom role'}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Role name" required minLength={2} maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <Input label="Description" maxLength={300} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              {!catalog.data && (
                <p className="text-sm text-amber-700">You need the "permissions.view" permission to see the full permission catalog.</p>
              )}
              <PermissionGroups groups={groups} selected={draft.permissions} editable canGrant={canGrant} onToggle={toggle} onToggleModule={toggleModule} />
              <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="gap-2" disabled={save.isPending || draft.name.trim().length < 2}>
                  <Save size={16} /> {save.isPending ? 'Saving…' : 'Save role'}
                </Button>
              </div>
            </form>
          ) : showing ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{showing.name}</h3>
                  <p className="text-sm text-slate-500">
                    {showing.isSystem
                      ? 'Built-in role — read-only. Its permissions are maintained by ClinicPlus.'
                      : showing.description || 'Custom role'}
                  </p>
                </div>
                {!showing.isSystem && (
                  <div className="flex gap-2">
                    {can('roles.update') && (
                      <Button variant="outline" size="sm" onClick={() => startEdit(showing)}>
                        Edit
                      </Button>
                    )}
                    {can('roles.delete') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-red-600"
                        disabled={remove.isPending || showing.userCount > 0}
                        title={showing.userCount > 0 ? 'Reassign its users before deleting' : undefined}
                        onClick={() => window.confirm(`Delete role "${showing.name}"?`) && remove.mutate(showing.id)}
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {showing.permissions.length === 0 ? (
                <p className="text-sm text-slate-500">This role grants no permissions.</p>
              ) : (
                <PermissionGroups groups={groups} selected={editingKeys} />
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a role to see its permissions.</p>
          )}
        </Card>
      </div>
    </div>
  );
};

const PermissionGroups = ({
  groups,
  selected,
  editable = false,
  canGrant,
  onToggle,
  onToggleModule,
}: {
  groups: [string, Permission[]][];
  selected: Set<string>;
  editable?: boolean;
  canGrant?: (key: string) => boolean;
  onToggle?: (key: string) => void;
  onToggleModule?: (keys: string[], on: boolean) => void;
}) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    {groups.map(([module, perms]) => {
      const grantable = perms.filter((p) => !canGrant || canGrant(p.key) || selected.has(p.key)).map((p) => p.key);
      const allOn = perms.every((p) => selected.has(p.key));
      return (
        <div key={module} className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">{humanize(module)}</span>
            {editable && onToggleModule && (
              <button type="button" className="text-xs font-medium text-[#1FA971] hover:underline" onClick={() => onToggleModule(grantable, !allOn)}>
                {allOn ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {perms.map((p) => {
              const allowed = !canGrant || canGrant(p.key);
              return (
                <li key={p.key}>
                  <label className={`flex items-start gap-2 text-sm ${editable && !allowed ? 'opacity-50' : ''}`} title={editable && !allowed ? 'You can only grant permissions you hold yourself' : undefined}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[#1FA971]"
                      checked={selected.has(p.key)}
                      disabled={!editable || (!allowed && !selected.has(p.key))}
                      onChange={() => onToggle?.(p.key)}
                      readOnly={!editable}
                    />
                    <span>
                      <span className="text-slate-800">{humanize(p.action)}</span>
                      {p.description && <span className="block text-xs text-slate-500">{p.description}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      );
    })}
  </div>
);
