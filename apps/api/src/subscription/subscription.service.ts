import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  DEFAULT_PLAN,
  PLANS,
  PLAN_ORDER,
  PlanDefinition,
  PlanResource,
  RESOURCE_LIMIT,
  planDefinition,
} from './plans';

export interface SubscriptionEnforcement {
  /** false → the org is suspended; only safelisted routes should be allowed. */
  active: boolean;
  status: string;
  reason?: string;
}

interface CachedEnforcement {
  value: SubscriptionEnforcement;
  expiresAt: number;
}

/** How long a positive/negative enforcement decision is trusted before re-querying. */
const ENFORCEMENT_TTL_MS = 30_000;
/** Manual plan switches (no card capture) grant a 30-day paid period. */
const MANUAL_PERIOD_DAYS = 30;
/** A self-service trial lasts this long when (re)started. */
const TRIAL_DAYS = 14;

/**
 * Subscription state, plan limits and plan management.
 *
 * `getEnforcement` is the hot path — it runs inside JwtStrategy on (nearly)
 * every authenticated request, so it is cached per-org for ~30s and ALWAYS
 * fails OPEN: a transient DB error must never lock an entire clinic out.
 *
 * Signature contract used by JwtStrategy (do not change): getEnforcement(orgId).
 * Kept @Global-exported via SubscriptionModule.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly enforcementCache = new Map<string, CachedEnforcement>();

  constructor(
    protected readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Enforcement (hot path)
  // ---------------------------------------------------------------------------

  async getEnforcement(organizationId: string): Promise<SubscriptionEnforcement> {
    const cached = this.enforcementCache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let value: SubscriptionEnforcement;
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { subscriptionStatus: true, trialEndsAt: true },
      });
      value = org
        ? this.evaluate(org.subscriptionStatus, org.trialEndsAt)
        : // Unknown org: let other guards reject it; never hard-block here.
          { active: true, status: 'UNKNOWN' };
    } catch (err) {
      // Fail OPEN: a database hiccup must not suspend every clinic.
      this.logger.error(`getEnforcement failed for ${organizationId}; failing open: ${(err as Error).message}`);
      value = { active: true, status: 'ERROR' };
    }

    this.enforcementCache.set(organizationId, { value, expiresAt: Date.now() + ENFORCEMENT_TTL_MS });
    return value;
  }

  /** Pure decision: ACTIVE / valid TRIAL → active; PAST_DUE / CANCELED / expired TRIAL → inactive. */
  private evaluate(status: SubscriptionStatus, trialEndsAt: Date | null): SubscriptionEnforcement {
    switch (status) {
      case 'ACTIVE':
        return { active: true, status };
      case 'TRIAL':
        // Null trialEndsAt = never expires. Otherwise active until the end date.
        if (!trialEndsAt || trialEndsAt.getTime() > Date.now()) return { active: true, status };
        return { active: false, status, reason: 'Your free trial has ended. Upgrade to continue.' };
      case 'PAST_DUE':
        return { active: false, status, reason: 'Your subscription payment is past due. Please update billing to continue.' };
      case 'CANCELED':
        return { active: false, status, reason: 'This clinic subscription has been canceled. Reactivate a plan to continue.' };
      default:
        // Any unknown/future status fails open.
        return { active: true, status: String(status) };
    }
  }

  /** Drop the cached decision so the next request re-reads the org (after plan/status changes). */
  private invalidate(organizationId: string) {
    this.enforcementCache.delete(organizationId);
  }

  // ---------------------------------------------------------------------------
  // Summary + usage
  // ---------------------------------------------------------------------------

  private limitsOf(def: PlanDefinition) {
    return { maxBranches: def.maxBranches, maxStaff: def.maxStaff, maxPatients: def.maxPatients };
  }

  private async usage(organizationId: string) {
    const [branches, staff, patients] = await Promise.all([
      this.prisma.branch.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.patient.count({ where: { organizationId } }),
    ]);
    return { branches, staff, patients };
  }

  /** Full picture for the billing screen: plan, status, dates, limits, live usage and the catalog. */
  async getSummary(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        subscriptionPlan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        currency: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const plan = org.subscriptionPlan ?? DEFAULT_PLAN;
    const def = planDefinition(plan);
    const usage = await this.usage(organizationId);
    const enforcement = this.evaluate(org.subscriptionStatus, org.trialEndsAt);

    return {
      plan,
      planName: def.name,
      status: org.subscriptionStatus,
      active: enforcement.active,
      reason: enforcement.reason,
      trialEndsAt: org.trialEndsAt,
      currentPeriodEnd: org.currentPeriodEnd,
      currency: org.currency,
      limits: this.limitsOf(def),
      usage,
      // Whole catalog so the UI can render the comparison grid without a second call.
      catalog: PLAN_ORDER.map((key) => PLANS[key]),
    };
  }

  // ---------------------------------------------------------------------------
  // Plan-limit enforcement (called from create paths)
  // ---------------------------------------------------------------------------

  private async currentCount(organizationId: string, resource: PlanResource): Promise<number> {
    switch (resource) {
      case 'branch':
        return this.prisma.branch.count({ where: { organizationId, status: 'ACTIVE' } });
      case 'staff':
        return this.prisma.user.count({ where: { organizationId, status: 'ACTIVE' } });
      case 'patient':
        return this.prisma.patient.count({ where: { organizationId } });
    }
  }

  /**
   * Throws 403 PLAN_LIMIT_REACHED when adding one more `resource` would exceed
   * the org's plan. Called from the branch and staff create paths. Fails OPEN on
   * an unexpected read error so a transient DB issue can't block legitimate work.
   */
  async assertCanAdd(organizationId: string, resource: PlanResource): Promise<void> {
    let def: PlanDefinition;
    let count: number;
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { subscriptionPlan: true },
      });
      def = planDefinition(org?.subscriptionPlan);
      const limit = def[RESOURCE_LIMIT[resource]];
      if (limit === null) return; // unlimited
      count = await this.currentCount(organizationId, resource);
      if (count < limit) return;
    } catch (err) {
      this.logger.error(`assertCanAdd(${resource}) failed for ${organizationId}; failing open: ${(err as Error).message}`);
      return;
    }
    const limit = def[RESOURCE_LIMIT[resource]];
    const noun = { branch: 'branches', staff: 'staff accounts', patient: 'patients' }[resource];
    throw new ForbiddenException({
      message: `Your ${def.name} plan allows up to ${limit} ${noun} (you have ${count}). Upgrade your plan to add more.`,
      error: 'PLAN_LIMIT_REACHED',
      statusCode: 403,
      details: { resource, plan: def.key, limit, current: count },
    });
  }

  // ---------------------------------------------------------------------------
  // Plan management (Owner / Super Admin)
  // ---------------------------------------------------------------------------

  /** Rejects a change whose target plan can't hold the org's current usage. */
  private async assertUsageFitsPlan(organizationId: string, target: PlanDefinition) {
    const usage = await this.usage(organizationId);
    const over: string[] = [];
    if (target.maxBranches !== null && usage.branches > target.maxBranches) {
      over.push(`branches (${usage.branches} / ${target.maxBranches})`);
    }
    if (target.maxStaff !== null && usage.staff > target.maxStaff) {
      over.push(`staff (${usage.staff} / ${target.maxStaff})`);
    }
    if (target.maxPatients !== null && usage.patients > target.maxPatients) {
      over.push(`patients (${usage.patients} / ${target.maxPatients})`);
    }
    if (over.length) {
      throw new BadRequestException(
        `The ${target.name} plan can't fit your current usage: ${over.join(', ')}. Reduce usage before downgrading.`,
      );
    }
  }

  /**
   * Manual plan switch (no card capture yet): set the plan, mark ACTIVE and
   * extend the paid period 30 days. Downgrades that would exceed the new plan's
   * limits are rejected. Audited. `actor` is the acting user for the audit trail.
   */
  async changePlan(
    organizationId: string,
    actor: { id: string },
    plan: SubscriptionPlan,
  ) {
    const def = PLANS[plan];
    if (!def) throw new BadRequestException('Unknown plan');
    await this.assertUsageFitsPlan(organizationId, def);

    const before = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionPlan: true, subscriptionStatus: true, currentPeriodEnd: true },
    });
    const currentPeriodEnd = new Date(Date.now() + MANUAL_PERIOD_DAYS * 86_400_000);
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionPlan: plan,
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd,
        updatedBy: actor.id,
      },
    });
    this.invalidate(organizationId);
    await this.audit.log({
      organizationId,
      userId: actor.id,
      action: 'SUBSCRIPTION_CHANGE_PLAN',
      resource: 'subscription',
      resourceId: organizationId,
      beforeData: before,
      afterData: { subscriptionPlan: plan, subscriptionStatus: 'ACTIVE', currentPeriodEnd },
    });
    return this.getSummary(organizationId);
  }

  /** (Re)start a self-service trial — handy to reactivate a lapsed clinic for a short window. */
  async startTrial(organizationId: string, actor: { id: string }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionPlan: true, subscriptionStatus: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.subscriptionStatus === 'ACTIVE') {
      throw new BadRequestException('Subscription is already active; no trial needed.');
    }
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionStatus: 'TRIAL',
        subscriptionPlan: org.subscriptionPlan ?? DEFAULT_PLAN,
        trialEndsAt,
        updatedBy: actor.id,
      },
    });
    this.invalidate(organizationId);
    await this.audit.log({
      organizationId,
      userId: actor.id,
      action: 'SUBSCRIPTION_START_TRIAL',
      resource: 'subscription',
      resourceId: organizationId,
      afterData: { subscriptionStatus: 'TRIAL', trialEndsAt },
    });
    return this.getSummary(organizationId);
  }

  /**
   * Super Admin override (support tooling): set any org's status and/or plan and
   * optionally its trial / period dates. Cross-tenant by design — only ever
   * reachable behind admin.view.
   */
  async adminSet(
    organizationId: string,
    actor: { id: string; organizationId: string },
    patch: {
      status?: SubscriptionStatus;
      plan?: SubscriptionPlan;
      trialEndsAt?: string | null;
      currentPeriodEnd?: string | null;
    },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionPlan: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (patch.plan && !PLANS[patch.plan]) throw new BadRequestException('Unknown plan');

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(patch.status ? { subscriptionStatus: patch.status } : {}),
        ...(patch.plan ? { subscriptionPlan: patch.plan } : {}),
        ...(patch.trialEndsAt !== undefined ? { trialEndsAt: patch.trialEndsAt ? new Date(patch.trialEndsAt) : null } : {}),
        ...(patch.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: patch.currentPeriodEnd ? new Date(patch.currentPeriodEnd) : null }
          : {}),
        updatedBy: actor.id,
      },
    });
    this.invalidate(organizationId);
    await this.audit.log({
      organizationId,
      userId: actor.id,
      action: 'SUBSCRIPTION_ADMIN_OVERRIDE',
      resource: 'subscription',
      resourceId: organizationId,
      beforeData: org,
      afterData: patch,
    });
    return this.getSummary(organizationId);
  }
}
