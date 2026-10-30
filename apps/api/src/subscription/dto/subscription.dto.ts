import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

/** Owner-initiated plan switch (manual, no card capture yet). */
export class ChangePlanDto {
  @IsEnum(SubscriptionPlan, { message: 'plan must be STARTER, GROWTH or ENTERPRISE' })
  plan!: SubscriptionPlan;
}

/** Super Admin override for support: any subset of these fields may be sent. */
export class AdminSubscriptionDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus, { message: 'status must be TRIAL, ACTIVE, PAST_DUE or CANCELED' })
  status?: SubscriptionStatus;

  @IsOptional()
  @IsEnum(SubscriptionPlan, { message: 'plan must be STARTER, GROWTH or ENTERPRISE' })
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsISO8601()
  trialEndsAt?: string;

  @IsOptional()
  @IsISO8601()
  currentPeriodEnd?: string;
}
