import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Copy, Search, UserPlus, X } from 'lucide-react';
import { Badge, Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';
import { useAuthStore } from '../../app/store/auth.store';
import { HasPermission, useCan } from '../../app/components/HasPermission';

interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  lastLoginAt: string | null;
  branchId: string;
  branch?: { id: string; name: string } | null;
  roles: { id: string; role: { id: string; name: string } }[];
}

interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

interface Invitation {
  id: string;
  email: string;
  phone: string | null;
  roleName: string | null;
  branchName: string | null;
  status: string;
  expiresAt: string;
}

interface InviteResult {
  email: string;
  emailDelivered: boolean;
  smsDelivered: boolean;
  emailError?: string;
  smsError?: string;
  inviteUrl?: string;
}

const selectCls = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';

export const StaffManagement = () => {
  const queryClient = useQueryClient();
  const can = useCan();
  const me = useAuthStore((s) => s.user);
  const orgWide = !!me?.orgWide;
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
  const [allBranches, setAllBranches] = useState(true);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [rolesFor, setRolesFor] = useState<StaffUser | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const staffKey = ['staff', status, orgWide && allBranches, search];
  const staff = useQuery({
    queryKey: staffKey,
    queryFn: async () => {
      const p = new URLSearchParams({ status });
      if (orgWide && allBranches) p.set('allBranches', 'true');
      if (search.trim()) p.set('search', search.trim());
      return unwrap<StaffUser[]>(await api.get(`/users?${p}`));
    },
  });
  const invitations = useQuery({
    queryKey: ['staff-invitations'],
    queryFn: async () => unwrap<Invitation[]>(await api.get('/staff-invitations')),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async () => unwrap<Role[]>(await api.get('/roles')),
    enabled: can('roles.view'),
  });
  const org = useQuery({
    queryKey: ['organization', 'current'],
    queryFn: async () => unwrap<any>(await api.get('/organizations/current')),
    enabled: can('organizations.view'),
  });
  const branches: { id: string; name: string }[] = org.data?.branches ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['staff'] });
    queryClient.invalidateQueries({ queryKey: ['staff-invitations'] });
    queryClient.invalidateQueries({ queryKey: ['roles'] });
  };
  const fail = (err: unknown) => setNotice({ ok: false, text: apiErrorMessage(err) });

  const invite = useMutation({
    mutationFn: async (body: Record<string, string>) => unwrap<InviteResult>(await api.post('/staff-invitations/invite', body)),
    onSuccess: (res) => {
      setInviteOpen(false);
      setInviteResult(res);
      refresh();
    },
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/users/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: (_r, v) => {
      setNotice({ ok: true, text: v.active ? 'Account activated.' : 'Account deactivated and signed out everywhere.' });
      refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/staff-invitations/${id}`),
    onSuccess: refresh,
    onError: fail,
  });
  const moveBranch = useMutation({
    mutationFn: ({ id, branchId }: { id: string; branchId: string }) => api.patch(`/users/${id}/branch`, { branchId }),
    onSuccess: () => {
      setNotice({ ok: true, text: 'Staff member moved.' });
      refresh();
    },
    onError: fail,
  });

  const pending = (invitations.data ?? []).filter((i) => i.status === 'PENDING');

  return (
    <div className="space-y-6">
      <PageHeader title="Staff" description="Invite team members, assign roles and control who can sign in.">
        <HasPermission permission="users.invite">
          <Button onClick={() => { setNotice(null); setInviteOpen(true); }} className="gap-2">
            <UserPlus size={16} /> Invite staff
          </Button>
        </HasPermission>
      </PageHeader>

      {notice && (
        <div className={`flex items-start justify-between rounded-md p-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {inviteResult && <InviteResultCard result={inviteResult} onClose={() => setInviteResult(null)} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden p-0 xl:col-span-2">
          <div className="flex flex-col gap-3 border-b bg-slate-50/50 p-4 md:flex-row md:items-center md:justify-between">
            <div className="relative md:w-64">
              <Search size={14} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-sm"
                placeholder="Search name, e-mail, phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <select className="h-10 rounded-xl border border-slate-200 bg-white px-3" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Deactivated</option>
                <option value="ALL">All</option>
              </select>
              {orgWide && (
                <label className="flex items-center gap-2 text-slate-600">
                  <input type="checkbox" className="accent-[#1FA971]" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} />
                  All branches
                </label>
              )}
            </div>
          </div>

          {staff.isLoading ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading staff…</p>
          ) : staff.error ? (
            <p className="p-8 text-center text-sm text-red-600">{apiErrorMessage(staff.error)}</p>
          ) : !staff.data?.length ? (
            <p className="p-8 text-center text-sm text-slate-500">No staff match these filters.</p>
          ) : (
            <ul className="divide-y">
              {staff.data.map((u) => {
                const self = u.id === me?.id;
                return (
                  <li key={u.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                        {u.firstName?.[0]}
                        {u.lastName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {u.firstName} {u.lastName} {self && <span className="text-xs text-slate-400">(you)</span>}
                          {u.status === 'INACTIVE' && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">Deactivated</span>}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {u.email}
                          {u.branch?.name ? ` · ${u.branch.name}` : ''}
                          {` · last sign-in ${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'never'}`}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r.id} className="border-blue-100 bg-blue-50 text-blue-700">{r.role.name}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    {!self && (
                      <div className="flex flex-wrap items-center gap-2">
                        <HasPermission permission="users.update">
                          <Button variant="outline" size="sm" onClick={() => { setNotice(null); setRolesFor(u); }}>
                            Roles
                          </Button>
                        </HasPermission>
                        {orgWide && can('users.update') && branches.length > 1 && (
                          <select
                            aria-label="Move to branch"
                            className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm"
                            value={u.branchId}
                            onChange={(e) => moveBranch.mutate({ id: u.id, branchId: e.target.value })}
                          >
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        )}
                        <HasPermission permission="users.deactivate">
                          {u.status === 'ACTIVE' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              disabled={setActive.isPending}
                              onClick={() => window.confirm(`Deactivate ${u.firstName} ${u.lastName}? They will be signed out immediately.`) && setActive.mutate({ id: u.id, active: false })}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" className="text-emerald-700" disabled={setActive.isPending} onClick={() => setActive.mutate({ id: u.id, active: true })}>
                              Reactivate
                            </Button>
                          )}
                        </HasPermission>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="h-fit overflow-hidden p-0">
          <div className="border-b bg-slate-50/50 p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-900">
              <Clock size={16} className="text-orange-500" /> Pending invitations
            </h3>
          </div>
          {invitations.isLoading ? (
            <p className="p-6 text-center text-xs text-slate-400">Loading…</p>
          ) : invitations.error ? (
            <p className="p-6 text-center text-xs text-red-600">{apiErrorMessage(invitations.error)}</p>
          ) : !pending.length ? (
            <p className="p-6 text-center text-xs text-slate-400">No pending invitations.</p>
          ) : (
            <ul className="divide-y">
              {pending.map((inv) => (
                <li key={inv.id} className="space-y-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{inv.email}</span>
                    <HasPermission permission="users.invite">
                      <button className="text-xs font-medium text-red-600 hover:underline" disabled={revoke.isPending} onClick={() => revoke.mutate(inv.id)}>
                        Revoke
                      </button>
                    </HasPermission>
                  </div>
                  <p className="text-xs text-slate-500">
                    {inv.roleName ?? 'Role removed'}
                    {inv.branchName ? ` · ${inv.branchName}` : ''} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {inviteOpen && (
        <InviteModal
          roles={(roles.data ?? []).filter((r) => r.name !== 'Patient' && r.name !== 'Super Admin')}
          branches={orgWide ? branches : branches.filter((b) => b.id === me?.branchId)}
          defaultBranchId={me?.branchId}
          pending={invite.isPending}
          error={invite.error ? apiErrorMessage(invite.error) : null}
          onClose={() => { invite.reset(); setInviteOpen(false); }}
          onSubmit={(body) => invite.mutate(body)}
        />
      )}

      {rolesFor && (
        <RolesModal
          user={rolesFor}
          roles={(roles.data ?? []).filter((r) => r.name !== 'Super Admin' || (me?.permissions ?? []).includes('admin.view'))}
          onClose={() => setRolesFor(null)}
          onSaved={() => {
            setRolesFor(null);
            setNotice({ ok: true, text: 'Roles updated. The change applies immediately.' });
            refresh();
          }}
        />
      )}
    </div>
  );
};

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
    <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-b-none p-6 sm:rounded-b-2xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
      </div>
      {children}
    </Card>
  </div>
);

const InviteModal = ({
  roles,
  branches,
  defaultBranchId,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  roles: Role[];
  branches: { id: string; name: string }[];
  defaultBranchId?: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: Record<string, string>) => void;
}) => (
  <Modal title="Invite a staff member" onClose={onClose}>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body: Record<string, string> = {
          email: String(f.get('email') ?? ''),
          roleId: String(f.get('roleId') ?? ''),
        };
        const phone = String(f.get('phone') ?? '').trim();
        const branchId = String(f.get('branchId') ?? '');
        if (phone) body.phone = phone;
        if (branchId) body.branchId = branchId;
        onSubmit(body);
      }}
      className="space-y-4"
    >
      <Input name="email" label="E-mail address" type="email" placeholder="staff@clinic.com" required />
      <Input name="phone" label="Mobile (optional, the link is also sent by SMS)" type="tel" placeholder="+91…" />
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Role
        <select name="roleId" className={selectCls} required defaultValue="">
          <option value="" disabled>Select a role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}{r.isSystem ? '' : ' (custom)'}</option>
          ))}
        </select>
      </label>
      {branches.length > 0 && (
        <label className="block space-y-1 text-sm font-medium text-slate-700">
          Branch
          <select name="branchId" className={selectCls} defaultValue={defaultBranchId}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      )}
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send invitation'}</Button>
      </div>
    </form>
  </Modal>
);

const InviteResultCard = ({ result, onClose }: { result: InviteResult; onClose: () => void }) => {
  const [copied, setCopied] = useState(false);
  const delivered = result.emailDelivered || result.smsDelivered;
  return (
    <Card className={`p-4 ${delivered ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2 text-sm">
          <p className="font-semibold text-slate-900">Invitation created for {result.email}</p>
          <p className="text-slate-700">
            E-mail: {result.emailDelivered ? 'sent' : `not sent${result.emailError ? ` (${result.emailError})` : ''}`}
            {result.smsDelivered !== undefined && (result.smsDelivered || result.smsError) ? ` · SMS: ${result.smsDelivered ? 'sent' : `not sent (${result.smsError})`}` : ''}
          </p>
          {result.inviteUrl && (
            <div className="space-y-1">
              <p className="text-amber-800">Share this one-time link with the invitee yourself (valid for 7 days):</p>
              <div className="flex items-center gap-2">
                <code className="block min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs">{result.inviteUrl}</code>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(result.inviteUrl!);
                    setCopied(true);
                  }}
                >
                  <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          )}
        </div>
        <button onClick={onClose} aria-label="Dismiss" className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
      </div>
    </Card>
  );
};

const RolesModal = ({ user, roles, onClose, onSaved }: { user: StaffUser; roles: Role[]; onClose: () => void; onSaved: () => void }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(user.roles.map((r) => r.role.id)));
  const save = useMutation({
    mutationFn: () => api.put(`/users/${user.id}/roles`, { roleIds: Array.from(selected) }),
    onSuccess: onSaved,
  });
  const sorted = useMemo(() => [...roles].sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name)), [roles]);
  return (
    <Modal title={`Roles for ${user.firstName} ${user.lastName}`} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">You can only assign roles whose permissions you hold yourself.</p>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {sorted.map((r) => (
          <li key={r.id}>
            <label className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1FA971]"
                checked={selected.has(r.id)}
                onChange={() =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(r.id)) n.delete(r.id);
                    else n.add(r.id);
                    return n;
                  })
                }
              />
              <span className="flex-1 text-slate-800">{r.name}</span>
              <span className="text-xs text-slate-400">{r.isSystem ? 'built-in' : 'custom'}</span>
            </label>
          </li>
        ))}
      </ul>
      {save.error && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{apiErrorMessage(save.error)}</div>}
      <div className="mt-4 flex justify-end gap-3 border-t pt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={save.isPending || selected.size === 0} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save roles'}
        </Button>
      </div>
    </Modal>
  );
};
