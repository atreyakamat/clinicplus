import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, RefreshCw } from 'lucide-react';
import { Button, Card, PageHeader, StatCard } from '@clinicplus/ui';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';

interface PlatformMetrics {
  generatedAt: string;
  totals: {
    organizations: number;
    activeOrganizations: number;
    newOrganizations30d: number;
    activeUsers: number;
    usersActive30d: number;
    usersActive7d: number;
    patients: number;
    appointments30d: number;
    invoices30d: number;
  };
  subscriptions: { status: string; count: number }[];
  organizations: {
    id: string;
    name: string;
    slug: string;
    status: string;
    subscriptionPlan: string | null;
    subscriptionStatus: string;
    createdAt: string;
    users: number;
    patients: number;
    branches: number;
    appointments30d: number;
    lastLoginAt: string | null;
  }[];
}

const fmt = (n: number) => n.toLocaleString();

/** Founder / platform panel. Super Admin only (admin.view); every number comes from GET /platform/metrics. */
export const PilotAdminPanel = () => {
  const can = useCan();
  const allowed = can('admin.view');
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['platform', 'metrics'],
    queryFn: async () => unwrap<PlatformMetrics>(await api.get('/platform/metrics')),
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Card className="p-8 text-center text-sm text-slate-600">
          The founder panel is only available to platform administrators.
          <div className="mt-4">
            <Link to="/" className="font-medium text-[#1FA971] hover:underline">Back to dashboard</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader title="Founder panel" description="Live platform metrics across every clinic.">
        <div className="flex gap-2">
          <Link to="/">
            <Button variant="outline" size="sm" className="gap-1"><ArrowLeft size={14} /> App</Button>
          </Link>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </PageHeader>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading platform metrics…</p>
      ) : error ? (
        <Card className="p-6 text-sm text-red-600">{apiErrorMessage(error)}</Card>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Clinics" value={fmt(data.totals.organizations)} change={`${fmt(data.totals.newOrganizations30d)} new in 30 days`} />
            <StatCard label="Active staff accounts" value={fmt(data.totals.activeUsers)} change={`${fmt(data.totals.usersActive7d)} signed in this week`} />
            <StatCard label="Appointments (30 days)" value={fmt(data.totals.appointments30d)} change={`${fmt(data.totals.invoices30d)} invoices raised`} />
            <StatCard label="Patients" value={fmt(data.totals.patients)} change={`${fmt(data.totals.usersActive30d)} staff active in 30 days`} />
          </div>

          {data.subscriptions.length > 0 && (
            <Card className="flex flex-wrap gap-3 p-4 text-sm">
              <span className="font-semibold text-slate-900">Subscriptions:</span>
              {data.subscriptions.map((s) => (
                <span key={s.status} className="rounded-full bg-slate-100 px-3 py-0.5 text-slate-700">
                  {s.status} · {fmt(s.count)}
                </span>
              ))}
            </Card>
          )}

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b bg-slate-50/50 p-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <Building2 size={18} className="text-[#2563EB]" /> Most recent clinics
              </h3>
              <span className="text-xs text-slate-400">Updated {new Date(data.generatedAt).toLocaleTimeString()}</span>
            </div>
            {data.organizations.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No clinics have signed up yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Clinic</th>
                      <th className="px-4 py-3 font-medium">Plan</th>
                      <th className="px-4 py-3 font-medium text-right">Staff</th>
                      <th className="px-4 py-3 font-medium text-right">Branches</th>
                      <th className="px-4 py-3 font-medium text-right">Patients</th>
                      <th className="px-4 py-3 font-medium text-right">Appts (30d)</th>
                      <th className="px-4 py-3 font-medium">Last sign-in</th>
                      <th className="px-4 py-3 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.organizations.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900">{o.name}</span>
                          <span className="block text-xs text-slate-400">{o.slug}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {o.subscriptionPlan ?? '—'} <span className="text-xs text-slate-400">({o.subscriptionStatus})</span>
                        </td>
                        <td className="px-4 py-3 text-right">{fmt(o.users)}</td>
                        <td className="px-4 py-3 text-right">{fmt(o.branches)}</td>
                        <td className="px-4 py-3 text-right">{fmt(o.patients)}</td>
                        <td className="px-4 py-3 text-right">{fmt(o.appointments30d)}</td>
                        <td className="px-4 py-3 text-slate-600">{o.lastLoginAt ? new Date(o.lastLoginAt).toLocaleDateString() : 'never'}</td>
                        <td className="px-4 py-3 text-slate-600">{new Date(o.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
};
