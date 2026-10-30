import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Zap, ShieldCheck, Building2, Users, UserRound } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@clinicplus/ui';
import { api, ApiError } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { unwrap, errorMessage } from '../doctors/scheduling';
import { SubscriptionInactive } from './SubscriptionInactive';

type PlanKey = 'STARTER' | 'GROWTH' | 'ENTERPRISE';
type StatusKey = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

interface PlanDef {
  key: PlanKey;
  name: string;
  priceMonthly: number;
  tagline: string;
  maxBranches: number | null;
  maxStaff: number | null;
  maxPatients: number | null;
  features: string[];
}

interface Summary {
  plan: PlanKey;
  planName: string;
  status: StatusKey;
  active: boolean;
  reason?: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  currency: string;
  limits: { maxBranches: number | null; maxStaff: number | null; maxPatients: number | null };
  usage: { branches: number; staff: number; patients: number };
  catalog: PlanDef[];
}

const STATUS_BADGE: Record<StatusKey, { variant: 'success' | 'info' | 'warning' | 'error'; label: string }> = {
  ACTIVE: { variant: 'success', label: 'Active' },
  TRIAL: { variant: 'info', label: 'Trial' },
  PAST_DUE: { variant: 'warning', label: 'Past due' },
  CANCELED: { variant: 'error', label: 'Canceled' },
};

const PLAN_ICON: Record<PlanKey, typeof Zap> = { STARTER: Zap, GROWTH: ShieldCheck, ENTERPRISE: Building2 };
const PLAN_RANK: Record<PlanKey, number> = { STARTER: 0, GROWTH: 1, ENTERPRISE: 2 };

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

const fmtMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

const fmtLimit = (n: number | null) => (n === null ? 'Unlimited' : n.toLocaleString());

function UsageBar({ icon: Icon, label, used, limit }: { icon: typeof Users; label: string; used: number; limit: number | null }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const atLimit = limit !== null && used >= limit;
  const near = limit !== null && pct >= 80 && !atLimit;
  const barColor = atLimit ? 'bg-red-500' : near ? 'bg-amber-500' : 'bg-[#1FA971]';
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-slate-600">
          <Icon size={16} className="text-slate-400" /> {label}
        </span>
        <span className={atLimit ? 'font-medium text-red-600' : 'text-slate-900'}>
          {used.toLocaleString()} <span className="text-slate-400">/ {fmtLimit(limit)}</span>
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: limit === null ? '12%' : `${Math.max(pct, 3)}%` }} />
      </div>
    </div>
  );
}

export const SubscriptionSettings = () => {
  const qc = useQueryClient();
  const can = useCan();
  const canManage = can('subscription.manage');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);

  const { data, isLoading, error } = useQuery<Summary>({
    queryKey: ['subscription'],
    queryFn: async () => unwrap<Summary>(await api.get('/subscription')),
  });

  const changePlan = useMutation({
    mutationFn: async (plan: PlanKey) => unwrap<Summary>(await api.patch('/subscription', { plan })),
    onSuccess: () => {
      setActionError(null);
      setPendingPlan(null);
      qc.invalidateQueries({ queryKey: ['subscription'] });
    },
    onError: (e) => {
      setPendingPlan(null);
      // Surface PLAN_LIMIT_REACHED and downgrade rejections with their clear API message.
      setActionError(errorMessage(e, 'Could not change plan'));
    },
  });

  const apply = (plan: PlanKey) => {
    if (!data) return;
    const downgrade = PLAN_RANK[plan] < PLAN_RANK[data.plan];
    const verb = downgrade ? 'Downgrade to' : plan === data.plan ? 'Reactivate' : 'Upgrade to';
    if (!confirm(`${verb} the ${plan.charAt(0) + plan.slice(1).toLowerCase()} plan?`)) return;
    setPendingPlan(plan);
    changePlan.mutate(plan);
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-72 animate-pulse rounded-xl bg-slate-100" />)}</div>
      </div>
    );
  }

  if (error || !data) {
    const msg = error instanceof ApiError && error.data?.error === 'SUBSCRIPTION_INACTIVE'
      ? error.data.message
      : errorMessage(error, 'Failed to load subscription');
    return <div className="max-w-3xl rounded-xl bg-red-50 p-6 text-red-700">{msg}</div>;
  }

  const status = STATUS_BADGE[data.status];
  const renewal = fmtDate(data.currentPeriodEnd);
  const trialEnd = fmtDate(data.trialEndsAt);

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Subscription" description="Your ClinicPlus plan, usage and billing status." />

      {!data.active && <SubscriptionInactive variant="banner" status={data.status} reason={data.reason ?? undefined} onManage={() => {}} />}

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError}</div>
      )}

      {/* Current plan + status */}
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-900">{data.planName} plan</h2>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {data.status === 'TRIAL' && trialEnd
                ? `Trial ends ${trialEnd}`
                : data.status === 'TRIAL'
                ? 'Trial (no end date)'
                : renewal
                ? `Renews ${renewal}`
                : 'No active billing period'}
            </p>
          </div>
        </div>

        <div className="grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <UsageBar icon={Building2} label="Branches" used={data.usage.branches} limit={data.limits.maxBranches} />
          <UsageBar icon={Users} label="Staff" used={data.usage.staff} limit={data.limits.maxStaff} />
          <UsageBar icon={UserRound} label="Patients" used={data.usage.patients} limit={data.limits.maxPatients} />
        </div>
      </Card>

      {/* Plan comparison */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Plans</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {data.catalog.map((plan) => {
            const Icon = PLAN_ICON[plan.key];
            const current = plan.key === data.plan;
            const downgrade = PLAN_RANK[plan.key] < PLAN_RANK[data.plan];
            return (
              <Card key={plan.key} className={current ? 'border-[#1FA971] ring-1 ring-[#1FA971]' : ''}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1FA971]/10 text-[#1FA971]">
                      <Icon size={18} />
                    </div>
                    <h4 className="font-semibold text-slate-900">{plan.name}</h4>
                  </div>
                  {current && <Badge variant="success">Current</Badge>}
                </div>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  {plan.priceMonthly > 0 ? fmtMoney(plan.priceMonthly, data.currency) : 'Custom'}
                  {plan.priceMonthly > 0 && <span className="text-sm font-normal text-slate-400"> / mo</span>}
                </p>
                <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check size={16} className="mt-0.5 shrink-0 text-[#1FA971]" /> {f}
                    </li>
                  ))}
                </ul>
                <HasPermission
                  permission="subscription.manage"
                  fallback={current ? <p className="mt-4 text-center text-xs text-slate-400">Your current plan</p> : null}
                >
                  <div className="mt-4">
                    {current ? (
                      data.active ? (
                        <Button variant="outline" className="w-full" disabled>
                          Current plan
                        </Button>
                      ) : (
                        <Button className="w-full" disabled={changePlan.isPending} onClick={() => apply(plan.key)}>
                          {pendingPlan === plan.key ? 'Reactivating…' : 'Reactivate'}
                        </Button>
                      )
                    ) : (
                      <Button
                        variant={downgrade ? 'outline' : 'primary'}
                        className="w-full"
                        disabled={changePlan.isPending}
                        onClick={() => apply(plan.key)}
                      >
                        {pendingPlan === plan.key ? 'Switching…' : downgrade ? 'Downgrade' : 'Upgrade'}
                      </Button>
                    )}
                  </div>
                </HasPermission>
              </Card>
            );
          })}
        </div>
        {!canManage && (
          <p className="mt-3 text-xs text-slate-400">Only the clinic owner can change the subscription plan.</p>
        )}
      </div>
    </div>
  );
};

export default SubscriptionSettings;
