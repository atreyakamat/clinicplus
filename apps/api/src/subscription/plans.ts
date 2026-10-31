import { SubscriptionPlan } from '@prisma/client';

/**
 * Plan catalog — the single source of truth for what each tier allows.
 *
 * A `null` limit means "unlimited". Prices are a monthly figure in the smallest
 * sensible whole unit of the clinic's billing currency (INR by default); the UI
 * renders them with the organization's currency. These are deliberately simple
 * SaaS tiers so the product can be sold by plan today and enforced immediately:
 *
 *   Starter    — a single-branch clinic getting started.
 *   Growth     — a small multi-branch group.
 *   Enterprise — hospitals / large networks, no hard caps.
 */
export interface PlanDefinition {
  key: SubscriptionPlan;
  name: string;
  /** Monthly price in the clinic's billing currency (0 = contact sales / custom). */
  priceMonthly: number;
  tagline: string;
  /** null = unlimited. */
  maxBranches: number | null;
  maxStaff: number | null;
  maxPatients: number | null;
  /** Human-readable capability lines shown on the comparison grid. */
  features: string[];
}

export const PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  STARTER: {
    key: 'STARTER',
    name: 'Starter',
    priceMonthly: 1999,
    tagline: 'For a single-location clinic finding its feet.',
    maxBranches: 1,
    maxStaff: 5,
    maxPatients: 2000,
    features: [
      '1 branch',
      'Up to 5 staff accounts',
      'Up to 2,000 patients',
      'Appointments, queue & consultations',
      'Invoicing & payments',
      'Email support',
    ],
  },
  GROWTH: {
    key: 'GROWTH',
    name: 'Growth',
    priceMonthly: 5999,
    tagline: 'For a growing multi-branch practice.',
    maxBranches: 3,
    maxStaff: 25,
    maxPatients: 20000,
    features: [
      'Up to 3 branches',
      'Up to 25 staff accounts',
      'Up to 20,000 patients',
      'Everything in Starter',
      'Campaigns & reviews',
      'Advanced analytics',
      'Priority support',
    ],
  },
  ENTERPRISE: {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: 0,
    tagline: 'For hospitals and large clinic networks.',
    maxBranches: null,
    maxStaff: null,
    maxPatients: null,
    features: [
      'Unlimited branches',
      'Unlimited staff',
      'Unlimited patients',
      'Everything in Growth',
      'Dedicated onboarding',
      'Custom integrations & SLA',
    ],
  },
};

/** Ordered weakest → strongest; used for comparison grids and upgrade logic. */
export const PLAN_ORDER: SubscriptionPlan[] = ['STARTER', 'GROWTH', 'ENTERPRISE'];

/** The plan a clinic falls back to when `subscriptionPlan` is still null. */
export const DEFAULT_PLAN: SubscriptionPlan = 'STARTER';

export type PlanResource = 'branch' | 'staff' | 'patient';

/** Maps a resource to the plan limit field that caps it. */
export const RESOURCE_LIMIT: Record<PlanResource, keyof Pick<PlanDefinition, 'maxBranches' | 'maxStaff' | 'maxPatients'>> = {
  branch: 'maxBranches',
  staff: 'maxStaff',
  patient: 'maxPatients',
};

export function planDefinition(plan: SubscriptionPlan | null | undefined): PlanDefinition {
  return PLANS[plan ?? DEFAULT_PLAN] ?? PLANS[DEFAULT_PLAN];
}
