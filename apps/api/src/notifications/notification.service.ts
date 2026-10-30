import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentReminderService } from '../appointments/appointment-reminder.service';
import { FollowUpReminderService } from '../follow-ups/follow-up-reminder.service';
import { CampaignsService } from '../campaigns/campaigns.service';

/** Shared by all replicas: only the holder of this Postgres advisory lock runs a scheduled pass. */
export const MESSAGING_AUTOMATION_LOCK_ID = 7_301_2618;

export interface AutomationRunResult {
  startedAt: string;
  finishedAt: string;
  scope: 'all' | 'organization';
  skipped?: string;
  results: Record<string, unknown>;
  errors: string[];
}

/**
 * Patient-messaging automation engine: booking confirmations, cancellation notices,
 * 24h/2h appointment reminders, follow-up reminders and campaign batches.
 *
 * Runs every REMINDER_INTERVAL_MINUTES when SCHEDULER_ENABLED=true (never in tests).
 * Every step is idempotent (Message.reminderKey is unique), and a Postgres advisory
 * transaction lock ensures only one replica runs a scheduled pass at a time.
 */
@Injectable()
export class NotificationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationService.name);
  private timer: NodeJS.Timeout | null = null;
  private inProcess = false;
  lastRun: AutomationRunResult | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appointmentReminderService: AppointmentReminderService,
    private readonly followUpReminderService: FollowUpReminderService,
    private readonly campaigns: CampaignsService,
  ) {}

  get schedulerActive() {
    return this.timer !== null;
  }

  onApplicationBootstrap() {
    if (this.config.get('NODE_ENV') === 'test') return;
    if (!this.config.get<boolean>('SCHEDULER_ENABLED')) {
      this.logger.log('Messaging automations disabled (SCHEDULER_ENABLED=false); use POST /api/v1/messages/automations/run');
      return;
    }
    const minutes = this.config.get<number>('REMINDER_INTERVAL_MINUTES') ?? 15;
    this.logger.log(`Messaging automations every ${minutes} minute(s)`);
    this.timer = setInterval(() => void this.runScheduled(), minutes * 60_000);
    this.timer.unref?.();
    setTimeout(() => void this.runScheduled(), 30_000).unref?.();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Scheduled pass across all organizations, guarded by the advisory lock. */
  async runScheduled(): Promise<AutomationRunResult> {
    const startedAt = new Date().toISOString();
    if (this.inProcess) {
      return { startedAt, finishedAt: startedAt, scope: 'all', skipped: 'previous run still in progress', results: {}, errors: [] };
    }
    this.inProcess = true;
    try {
      // The transaction pins one connection that holds the xact lock for the whole pass
      // (session-level locks would be unreliable across Prisma's connection pool).
      return await this.prisma.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${MESSAGING_AUTOMATION_LOCK_ID}) AS locked`;
          if (!locked) {
            return { startedAt, finishedAt: new Date().toISOString(), scope: 'all' as const, skipped: 'another replica is running automations', results: {}, errors: [] };
          }
          const result = await this.runAll();
          this.lastRun = result;
          return result;
        },
        { timeout: 30 * 60_000, maxWait: 10_000 },
      );
    } catch (err) {
      this.logger.error(`Messaging automation pass failed: ${(err as Error).message}`);
      return { startedAt, finishedAt: new Date().toISOString(), scope: 'all', results: {}, errors: [(err as Error).message] };
    } finally {
      this.inProcess = false;
    }
  }

  /**
   * One pass of every automation. With organizationId (manual "run now" from the UI) only that
   * tenant's data is touched. Safe to run concurrently with the scheduler thanks to reminderKey.
   */
  async runAll(organizationId?: string): Promise<AutomationRunResult> {
    const startedAt = new Date().toISOString();
    const results: Record<string, unknown> = {};
    const errors: string[] = [];
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        results[name] = await fn();
      } catch (err) {
        errors.push(`${name}: ${(err as Error).message}`);
        this.logger.error(`Automation ${name} failed: ${(err as Error).message}`);
      }
    };
    await step('bookingConfirmations', () => this.appointmentReminderService.sendBookingConfirmations(organizationId));
    await step('cancellationNotices', () => this.appointmentReminderService.sendCancellationNotices(organizationId));
    await step('reminders24h', () => this.appointmentReminderService.send24HourReminders(organizationId));
    await step('reminders2h', () => this.appointmentReminderService.send2HourReminders(organizationId));
    await step('followUpsDue', () => this.followUpReminderService.sendDueReminders(organizationId));
    await step('followUpsOverdue', () => this.followUpReminderService.sendOverdueReminders(organizationId));
    await step('campaigns', () => this.campaigns.processDueCampaigns(organizationId));
    const out: AutomationRunResult = {
      startedAt,
      finishedAt: new Date().toISOString(),
      scope: organizationId ? 'organization' : 'all',
      results,
      errors,
    };
    return out;
  }

  /**
   * Legacy entry point (src/tasks TaskSchedulerService calls this hourly). When this service's own
   * scheduler is active it is a no-op, otherwise it runs a locked pass.
   */
  async sendScheduledNotifications() {
    if (this.schedulerActive) return;
    if (!this.config.get<boolean>('SCHEDULER_ENABLED')) return;
    await this.runScheduled();
  }

  async sendAppointmentRemindersForHours(hoursBefore: number) {
    return this.appointmentReminderService.sendAppointmentReminders(hoursBefore);
  }

  async sendFollowUpRemindersForDays(daysBefore: number) {
    return this.followUpReminderService.sendFollowUpReminders(daysBefore);
  }
}
