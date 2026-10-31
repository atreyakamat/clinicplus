import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@clinicplus/ui';
import { useCan } from '../../app/components/HasPermission';

export interface SubscriptionInactiveProps {
  /** Human-readable reason from the API (e.g. "Your free trial has ended."). */
  reason?: string;
  status?: string;
  /** Compact banner for embedding inside a page; omit for the full-screen block. */
  variant?: 'screen' | 'banner';
  /** Navigate the user to the billing page (used when rendered outside /settings/subscription). */
  onManage?: () => void;
}

const DEFAULT_REASON = 'This clinic subscription is inactive. Reactivate a plan to continue.';

/**
 * Shown when a clinic's subscription is suspended (trial ended / past due /
 * canceled). The API blocks every non-safelisted route for these clinics, so
 * this is the global "you can't use the app until you reactivate" surface.
 *
 * It is intentionally self-contained (no router / store coupling) so it can be
 * dropped into the app shell as a global interstitial, into a page as a banner,
 * or rendered by SubscriptionSettings itself.
 */
export const SubscriptionInactive = ({ reason, status, variant = 'screen', onManage }: SubscriptionInactiveProps) => {
  const can = useCan();
  const canManage = can('subscription.manage');
  const message = reason || DEFAULT_REASON;

  const cta = onManage ? (
    <Button className="gap-2" onClick={onManage}>
      {canManage ? 'Reactivate subscription' : 'View subscription'} <ArrowRight size={16} />
    </Button>
  ) : (
    <a href="/settings/subscription">
      <Button className="gap-2">
        {canManage ? 'Reactivate subscription' : 'View subscription'} <ArrowRight size={16} />
      </Button>
    </a>
  );

  if (variant === 'banner') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={20} />
          <div>
            <p className="font-medium text-amber-900">Subscription {status ? status.toLowerCase().replace('_', ' ') : 'inactive'}</p>
            <p className="text-sm text-amber-800">{message}</p>
          </div>
        </div>
        {cta}
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <AlertTriangle size={28} />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Subscription inactive</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <p className="mt-1 text-xs text-slate-400">
          {canManage
            ? 'As the clinic owner you can reactivate a plan now.'
            : 'Ask your clinic owner to reactivate the subscription.'}
        </p>
        <div className="mt-6 flex justify-center">{cta}</div>
      </div>
    </div>
  );
};

export default SubscriptionInactive;
