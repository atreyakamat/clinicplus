import React, { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, PageHeader, Button } from '@clinicplus/ui';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';

interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  ipAddress: string | null;
  beforeData: unknown;
  afterData: unknown;
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
}

const PAGE_SIZE = 50;

/** Audit trail viewer (GET /audit-logs, audit.view) with filters and pagination. */
export const AuditLogSettings = () => {
  const [filters, setFilters] = useState({ actorId: '', action: '', entityType: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [filters, page]);

  const facets = useQuery({
    queryKey: ['audit-facets'],
    queryFn: async () => unwrap<{ actions: string[]; entityTypes: string[] }>(await api.get('/audit-logs/facets')),
  });
  const staff = useQuery({
    queryKey: ['users', 'all-branches', 'ALL'],
    queryFn: async () => unwrap<any[]>(await api.get('/users?allBranches=true&status=ALL')),
    retry: false,
  });
  const logs = useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => api.get(`/audit-logs?${query}`),
    placeholderData: keepPreviousData,
  });

  const rows: AuditRow[] = logs.data?.data ?? [];
  const total: number = logs.data?.meta?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  };
  const select = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="A tamper-evident record of sign-ins, access changes and clinical / billing edits." />

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-medium text-slate-600">
          Staff member
          <select className={select} value={filters.actorId} onChange={set('actorId')}>
            <option value="">Everyone</option>
            {(staff.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Action
          <select className={select} value={filters.action} onChange={set('action')}>
            <option value="">All actions</option>
            {(facets.data?.actions ?? []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Record type
          <select className={select} value={filters.entityType} onChange={set('entityType')}>
            <option value="">All records</option>
            {(facets.data?.entityTypes ?? []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          From
          <input type="date" className={select} value={filters.from} onChange={set('from')} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          To
          <input type="date" className={select} value={filters.to} onChange={set('to')} />
        </label>
      </Card>

      <Card className="overflow-hidden p-0">
        {logs.isLoading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading audit entries…</p>
        ) : logs.error ? (
          <p className="p-8 text-center text-sm text-red-600">{apiErrorMessage(logs.error)}</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No audit entries match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Who</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Record</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {r.actor ? (
                          <span className="font-medium text-slate-900">{r.actor.firstName} {r.actor.lastName}</span>
                        ) : (
                          <span className="text-slate-400">System</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{r.action}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.entityType ?? '—'}
                        {r.entityId && <span className="ml-1 font-mono text-xs text-slate-400">{r.entityId.slice(0, 8)}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(r.beforeData != null || r.afterData != null) && (
                          <button className="text-xs font-medium text-[#1FA971] hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>
                            {open === r.id ? 'Hide' : 'Details'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-700">
                              <span className="font-semibold">Before</span>
                              {'\n'}
                              {JSON.stringify(r.beforeData ?? null, null, 2)}
                            </pre>
                            <pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-700">
                              <span className="font-semibold">After</span>
                              {'\n'}
                              {JSON.stringify(r.afterData ?? null, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-slate-500">
          <span>
            {total} entr{total === 1 ? 'y' : 'ies'} · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
