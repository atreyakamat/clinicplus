import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import { SmsService } from '../messages/sms.service';
import {
  CreateReviewRequestDto,
  ListReviewRequestsQueryDto,
  ListReviewsQueryDto,
  REVIEW_REQUEST_STATUS,
  ReviewSummaryQueryDto,
  SubmitReviewDto,
} from './dto/review.dto';

export interface ReviewActor {
  id: string;
  organizationId: string;
  branchId: string;
}

export const REVIEW_REQUEST_TTL_DAYS = 14;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

const REVIEW_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  doctor: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ReviewInclude;

type SendResult = { delivered: boolean; error?: string };

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAssertService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly config: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  static newToken() {
    return randomBytes(24).toString('base64url');
  }

  reviewLink(token: string) {
    const base = (this.config.get<string>('APP_BASE_URL') || 'http://localhost:5173').replace(/\/+$/, '');
    return `${base}/r/${token}`;
  }

  /**
   * SmsService is registered by MessagesModule (which does not export it), so it
   * is resolved from the application container instead of being re-provided here.
   */
  private smsService(): Pick<SmsService, 'sendAndRecord'> | null {
    try {
      return this.moduleRef.get(SmsService, { strict: false });
    } catch {
      return null;
    }
  }

  private async deliver(request: { id: string; token: string; patientId: string; organizationId: string; branchId: string }, clinicName: string, firstName: string): Promise<SendResult> {
    const link = this.reviewLink(request.token);
    const content = `Hi ${firstName}, thank you for visiting ${clinicName}. We'd love your feedback — it takes 30 seconds: ${link}`;
    const sms = this.smsService();
    let result: SendResult;
    if (!sms) {
      result = { delivered: false, error: 'Messaging service is not available' };
    } else {
      try {
        const sent: any = await sms.sendAndRecord(request.patientId, content, request.organizationId, request.branchId);
        const failed = sent?.deliveryStatus === 'FAILED' || sent?.success === false;
        result = failed
          ? { delivered: false, error: sent?.gatewayError || sent?.error || 'Message delivery failed' }
          : { delivered: true };
      } catch (err) {
        result = { delivered: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    await this.prisma.reviewRequest.update({
      where: { id: request.id },
      data: result.delivered
        ? { status: REVIEW_REQUEST_STATUS.SENT, sentAt: new Date() }
        : { status: REVIEW_REQUEST_STATUS.FAILED },
    });
    if (!result.delivered) this.logger.warn(`Review request ${request.id} not delivered: ${result.error}`);
    return result;
  }

  /** Staff-initiated review request: creates a one-time link and texts it to the patient. */
  async createRequest(dto: CreateReviewRequestDto, actor: ReviewActor) {
    const patient = await this.tenant.patient(dto.patientId, actor.organizationId);
    if (!patient.phone) throw new BadRequestException('Patient has no phone number on file');
    if (!patient.communicationOptIn) throw new BadRequestException('Patient has opted out of communications');

    let doctorId = dto.doctorId ?? null;
    let appointmentId: string | null = null;
    if (dto.appointmentId) {
      const appt = await this.tenant.appointment(dto.appointmentId, actor.organizationId);
      if (appt.patientId !== patient.id) throw new BadRequestException('Appointment belongs to a different patient');
      appointmentId = appt.id;
      doctorId = doctorId ?? appt.doctorId;
      const existing = await this.prisma.reviewRequest.findFirst({
        where: { organizationId: actor.organizationId, appointmentId: appt.id },
        select: { id: true },
      });
      if (existing) throw new ConflictException('A review request was already sent for this visit');
    }
    if (!doctorId) {
      const last = await this.prisma.appointment.findFirst({
        where: { organizationId: actor.organizationId, patientId: patient.id, status: 'COMPLETED', deletedAt: null },
        orderBy: { scheduledStart: 'desc' },
        select: { id: true, doctorId: true },
      });
      doctorId = last?.doctorId ?? null;
      appointmentId = appointmentId ?? last?.id ?? null;
    }
    if (!doctorId) {
      throw new BadRequestException('doctorId is required: the patient has no completed visit to review');
    }
    await this.tenant.user(doctorId, actor.organizationId, { label: 'Doctor' });

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { name: true },
    });
    const request = await this.prisma.reviewRequest.create({
      data: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        patientId: patient.id,
        doctorId,
        appointmentId,
        token: ReviewsService.newToken(),
        channel: 'SMS',
        status: REVIEW_REQUEST_STATUS.PENDING,
        expiresAt: new Date(Date.now() + REVIEW_REQUEST_TTL_DAYS * 24 * 3600_000),
      },
    });
    const delivery = await this.deliver(request, org.name, patient.firstName);
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'REVIEW_REQUEST_SENT',
      resource: 'ReviewRequest',
      resourceId: request.id,
      afterData: { patientId: patient.id, doctorId, appointmentId, delivered: delivery.delivered },
    });
    const fresh = await this.prisma.reviewRequest.findUniqueOrThrow({ where: { id: request.id } });
    return { ...fresh, link: this.reviewLink(fresh.token), delivery };
  }

  /**
   * Automatic request for a completed appointment (scheduler). The caller holds
   * the job lock, so the "no request yet" check cannot race another replica.
   */
  async createAutomaticRequest(appointment: {
    id: string;
    organizationId: string;
    branchId: string;
    patientId: string;
    doctorId: string;
  }) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: appointment.patientId, organizationId: appointment.organizationId },
      select: { firstName: true, phone: true, communicationOptIn: true },
    });
    if (!patient?.phone || !patient.communicationOptIn) return null;
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: appointment.organizationId },
      select: { name: true },
    });
    const request = await this.prisma.reviewRequest.create({
      data: {
        organizationId: appointment.organizationId,
        branchId: appointment.branchId,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        appointmentId: appointment.id,
        token: ReviewsService.newToken(),
        channel: 'SMS',
        status: REVIEW_REQUEST_STATUS.PENDING,
        expiresAt: new Date(Date.now() + REVIEW_REQUEST_TTL_DAYS * 24 * 3600_000),
      },
    });
    const delivery = await this.deliver(request, org.name, patient.firstName);
    return { id: request.id, delivery };
  }

  async listRequests(query: ListReviewRequestsQueryDto, actor: ReviewActor) {
    const { page, limit, skip, take } = pageArgs(query);
    const where: Prisma.ReviewRequestWhereInput = {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.reviewRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.reviewRequest.count({ where }),
    ]);
    const patients = await this.prisma.patient.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.patientId))] }, organizationId: actor.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    const byId = new Map(patients.map((p) => [p.id, p]));
    const now = new Date();
    // The token is a bearer credential for the public form: never list it.
    const items = rows.map(({ token: _token, ...r }) => ({
      ...r,
      patient: byId.get(r.patientId) ?? null,
      expired: !r.completedAt && r.expiresAt < now,
    }));
    return paginated(items, total, page, limit);
  }

  // ---------------------------------------------------------------- public

  private async loadByToken(token: string) {
    if (!TOKEN_RE.test(token)) throw new NotFoundException('Review link not found');
    const request = await this.prisma.reviewRequest.findUnique({
      where: { token },
      include: { organization: { select: { name: true, logoUrl: true, primaryColor: true, status: true } } },
    });
    if (!request || request.organization.status !== 'ACTIVE') throw new NotFoundException('Review link not found');
    return request;
  }

  private assertUsable(request: { completedAt: Date | null; expiresAt: Date }) {
    if (request.completedAt) throw new ConflictException('This review link has already been used. Thank you!');
    if (request.expiresAt <= new Date()) throw new GoneException('This review link has expired');
  }

  /** Minimal, PII-free context for the public review form. */
  async publicInfo(token: string) {
    const request = await this.loadByToken(token);
    this.assertUsable(request);
    const [patient, doctor] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: request.patientId }, select: { firstName: true } }),
      request.doctorId
        ? this.prisma.user.findUnique({ where: { id: request.doctorId }, select: { firstName: true, lastName: true } })
        : null,
    ]);
    return {
      clinicName: request.organization.name,
      logoUrl: request.organization.logoUrl,
      primaryColor: request.organization.primaryColor,
      doctorName: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}`.trim() : null,
      patientFirstName: patient?.firstName ?? null,
      expiresAt: request.expiresAt,
    };
  }

  async publicSubmit(token: string, dto: SubmitReviewDto) {
    const request = await this.loadByToken(token);
    this.assertUsable(request);
    if (!request.doctorId) throw new BadRequestException('This review link is not linked to a visit');
    const now = new Date();

    const review = await this.prisma.$transaction(async (tx) => {
      // Single use: only one concurrent submit can flip completedAt.
      const claimed = await tx.reviewRequest.updateMany({
        where: { id: request.id, completedAt: null, expiresAt: { gt: now } },
        data: { completedAt: now, status: REVIEW_REQUEST_STATUS.COMPLETED },
      });
      if (claimed.count !== 1) throw new ConflictException('This review link has already been used. Thank you!');
      const created = await tx.review.create({
        data: {
          organizationId: request.organizationId,
          branchId: request.branchId,
          patientId: request.patientId,
          doctorId: request.doctorId!,
          rating: dto.rating,
          npsScore: dto.npsScore ?? null,
          reviewText: dto.comment || null,
          source: 'REVIEW_REQUEST',
          requestId: request.id,
        },
      });
      await this.timeline.record(
        {
          organizationId: request.organizationId,
          patientId: request.patientId,
          eventType: 'REVIEW_SUBMITTED',
          eventCategory: 'ENGAGEMENT',
          title: `Patient left a ${dto.rating}-star review`,
          description: dto.comment?.slice(0, 500),
          metadata: { reviewId: created.id, rating: dto.rating, npsScore: dto.npsScore ?? null },
        },
        tx,
      );
      return created;
    });
    return { submitted: true, reviewId: review.id, clinicName: request.organization.name };
  }

  // ---------------------------------------------------------------- staff views

  async findAll(query: ListReviewsQueryDto, actor: ReviewActor) {
    const { page, limit, skip, take } = pageArgs(query);
    const where: Prisma.ReviewWhereInput = {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      ...(query.doctorId ? { doctorId: query.doctorId } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.isPublic !== undefined ? { isPublic: query.isPublic } : {}),
      ...(query.rating || query.maxRating
        ? {
            rating: {
              ...(query.rating ? { gte: query.rating } : {}),
              ...(query.maxRating ? { lte: query.maxRating } : {}),
            },
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({ where, include: REVIEW_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.review.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  async findOne(id: string, actor: ReviewActor) {
    assertUuid(id, 'reviewId');
    const review = await this.prisma.review.findFirst({
      where: { id, organizationId: actor.organizationId, branchId: actor.branchId },
      include: REVIEW_INCLUDE,
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  async setPublic(id: string, isPublic: boolean, actor: ReviewActor) {
    const before = await this.findOne(id, actor);
    const review = await this.prisma.review.update({ where: { id }, data: { isPublic }, include: REVIEW_INCLUDE });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: isPublic ? 'REVIEW_PUBLISHED' : 'REVIEW_UNPUBLISHED',
      resource: 'Review',
      resourceId: id,
      beforeData: { isPublic: before.isPublic },
      afterData: { isPublic },
    });
    return review;
  }

  /** Reputation summary: average rating, NPS (%promoters - %detractors), distribution, per doctor, request funnel. */
  async summary(query: ReviewSummaryQueryDto, actor: ReviewActor) {
    const created =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          }
        : undefined;
    const where: Prisma.ReviewWhereInput = {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      ...(created ? { createdAt: created } : {}),
    };
    const [agg, dist, byDoctor, promoters, passives, detractors, publicCount, requestsSent, requestsCompleted] =
      await Promise.all([
        this.prisma.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
        this.prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
        this.prisma.review.groupBy({
          by: ['doctorId'],
          where,
          _avg: { rating: true, npsScore: true },
          _count: { _all: true },
        }),
        this.prisma.review.count({ where: { ...where, npsScore: { gte: 9 } } }),
        this.prisma.review.count({ where: { ...where, npsScore: { gte: 7, lte: 8 } } }),
        this.prisma.review.count({ where: { ...where, npsScore: { lte: 6 } } }),
        this.prisma.review.count({ where: { ...where, isPublic: true } }),
        this.prisma.reviewRequest.count({
          where: {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            status: { in: [REVIEW_REQUEST_STATUS.SENT, REVIEW_REQUEST_STATUS.COMPLETED] },
            ...(created ? { createdAt: created } : {}),
          },
        }),
        this.prisma.reviewRequest.count({
          where: {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            status: REVIEW_REQUEST_STATUS.COMPLETED,
            ...(created ? { createdAt: created } : {}),
          },
        }),
      ]);

    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const d of dist) distribution[String(d.rating)] = d._count._all;
    const npsResponses = promoters + passives + detractors;
    const nps = npsResponses ? Math.round(((promoters - detractors) / npsResponses) * 100) : null;

    const doctors = await this.prisma.user.findMany({
      where: { id: { in: byDoctor.map((d) => d.doctorId) }, organizationId: actor.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    const doctorById = new Map(doctors.map((d) => [d.id, d]));
    const round1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);

    return {
      totalReviews: agg._count._all,
      averageRating: round1(agg._avg.rating),
      distribution,
      nps: { score: nps, responses: npsResponses, promoters, passives, detractors },
      publicReviews: publicCount,
      requests: {
        sent: requestsSent,
        completed: requestsCompleted,
        responseRate: requestsSent ? Math.round((requestsCompleted / requestsSent) * 1000) / 10 : 0,
      },
      byDoctor: byDoctor
        .map((d) => ({
          doctorId: d.doctorId,
          name: doctorById.has(d.doctorId)
            ? `${doctorById.get(d.doctorId)!.firstName} ${doctorById.get(d.doctorId)!.lastName}`
            : 'Unknown',
          reviews: d._count._all,
          averageRating: round1(d._avg.rating),
          averageNps: round1(d._avg.npsScore),
        }))
        .sort((a, b) => b.reviews - a.reviews),
    };
  }
}
