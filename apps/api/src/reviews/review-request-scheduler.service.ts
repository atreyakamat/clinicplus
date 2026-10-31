import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { IntervalJob, LOCK_IDS, schedulerEnabled, withJobLock } from '../tasks/scheduler-lock';
import { ReviewsService } from './reviews.service';

/** Don't ask the same patient again within this window. */
const PATIENT_COOLDOWN_DAYS = 30;
const BATCH = 200;

/**
 * Sends one review request per appointment COMPLETED 2-24 hours ago
 * (Appointment.updatedAt is the completion time) that has none yet. Guarded by
 * an advisory lock so only one replica selects + creates requests at a time.
 */
@Injectable()
export class ReviewRequestSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReviewRequestSchedulerService.name);
  private readonly job = new IntervalJob('automatic review requests', 15 * 60_000, () => this.runOnce(), this.logger);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reviews: ReviewsService,
  ) {}

  onApplicationBootstrap() {
    if (schedulerEnabled(this.config)) this.job.start();
  }

  onApplicationShutdown() {
    this.job.stop();
  }

  /** `organizationId` limits the scan to one tenant (used by tests / manual runs). */
  async runOnce(now = new Date(), organizationId?: string) {
    const windowStart = new Date(now.getTime() - 24 * 3600_000);
    const windowEnd = new Date(now.getTime() - 2 * 3600_000);
    const cooldown = new Date(now.getTime() - PATIENT_COOLDOWN_DAYS * 24 * 3600_000);
    const orgFilter = organizationId ?? null;

    const result = await withJobLock(
      this.prisma,
      LOCK_IDS.reviewRequests,
      async (tx) => {
        const candidates = await tx.$queryRaw<
          { id: string; organization_id: string; branch_id: string; patient_id: string; doctor_id: string }[]
        >`
          SELECT a.id, a.organization_id, a.branch_id, a.patient_id, a.doctor_id
          FROM appointments a
          JOIN patients p ON p.id = a.patient_id
          JOIN organizations o ON o.id = a.organization_id
          WHERE a.status = 'COMPLETED'
            AND a.deleted_at IS NULL
            AND a.updated_at >= ${windowStart} AND a.updated_at <= ${windowEnd}
            AND p.phone IS NOT NULL AND p.communication_opt_in = true AND p.deleted_at IS NULL
            AND o.status = 'ACTIVE'
            AND (${orgFilter}::uuid IS NULL OR a.organization_id = ${orgFilter}::uuid)
            AND NOT EXISTS (SELECT 1 FROM review_requests r WHERE r.appointment_id = a.id)
            AND NOT EXISTS (
              SELECT 1 FROM review_requests r
              WHERE r.patient_id = a.patient_id AND r.created_at >= ${cooldown}
            )
          ORDER BY a.updated_at ASC
          LIMIT ${BATCH}`;
        const seenPatients = new Set<string>();
        let created = 0;
        let delivered = 0;
        for (const c of candidates) {
          if (seenPatients.has(c.patient_id)) continue;
          seenPatients.add(c.patient_id);
          const res = await this.reviews.createAutomaticRequest({
            id: c.id,
            organizationId: c.organization_id,
            branchId: c.branch_id,
            patientId: c.patient_id,
            doctorId: c.doctor_id,
          });
          if (res) {
            created++;
            if (res.delivery.delivered) delivered++;
          }
        }
        return { candidates: candidates.length, created, delivered };
      },
      300_000,
    );
    if (result?.created) {
      this.logger.log(`Automatic review requests: created ${result.created}, delivered ${result.delivered}`);
    }
    return result ?? { skipped: true as const };
  }
}
