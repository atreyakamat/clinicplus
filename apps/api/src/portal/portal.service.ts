import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Readable } from 'stream';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PdfService } from '../common/services/pdf.service';
import { StorageService } from '../storage/storage.service';
import { ScheduleService, FREE_STATUSES } from '../doctors/schedule.service';
import { LedgerService } from '../payments/ledger.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { StripeService } from '../payments/stripe.service';
import { D, toMinorUnits } from '../invoices/billing.utils';
import { assertUuid } from '../common/validation/uuid';
import { PortalAuthService } from './portal-auth.service';
import { PortalPatientContext } from './portal.constants';
import {
  EnablePortalDto,
  PortalBookAppointmentDto,
  UpdatePortalProfileDto,
} from './dto/portal.dto';

const MAX_DURATION_MS = 8 * 60 * 60 * 1000;

/** Staff actor for the enable/disable endpoints (comes from the staff JWT). */
export interface StaffActor {
  id: string;
  organizationId: string;
  branchId: string;
  /** True for Owner / Clinic Admin / Super Admin: may act across branches. */
  orgWide: boolean;
}

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly organizations: OrganizationsService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly schedule: ScheduleService,
    private readonly ledger: LedgerService,
    private readonly stripe: StripeService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  /**
   * Blocks new activity (bookings, online payments) for a clinic whose
   * subscription is suspended, while leaving read access to records open.
   * Patients bypass the staff JwtStrategy gate, so it is enforced here.
   */
  private async assertClinicActive(organizationId: string) {
    const enforcement = await this.subscriptions.getEnforcement(organizationId);
    if (!enforcement.active) {
      throw new ForbiddenException(
        'This clinic is not currently accepting online bookings or payments. Please contact the clinic.',
      );
    }
  }

  // ================================================================ profile

  async getMe(ctx: PortalPatientContext) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: ctx.patientId, organizationId: ctx.organizationId, status: 'ACTIVE' },
      select: {
        id: true,
        patientCode: true,
        firstName: true,
        middleName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        phone: true,
        email: true,
        bloodGroup: true,
        preferredChannel: true,
        communicationOptIn: true,
        portalLastLoginAt: true,
        addresses: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { addressLine1: true, addressLine2: true, city: true, state: true, country: true, postalCode: true },
        },
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    const org = await this.organizations.findOne(ctx.organizationId, ctx.organizationId);
    const { addresses, ...rest } = patient;
    return {
      ...rest,
      address: addresses[0] ?? null,
      organization: { id: org.id, name: org.name, slug: org.slug, primaryColor: org.primaryColor, logoUrl: org.logoUrl },
    };
  }

  async updateMe(ctx: PortalPatientContext, dto: UpdatePortalProfileDto) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: ctx.patientId, organizationId: ctx.organizationId, status: 'ACTIVE' },
      select: { id: true, branchId: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const data: Prisma.PatientUpdateInput = {};
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.preferredChannel !== undefined) data.preferredChannel = dto.preferredChannel;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.patient.update({ where: { id: patient.id }, data: { ...data, updatedBy: patient.id } });
      }
      if (dto.address) {
        const existing = await tx.patientAddress.findFirst({
          where: { patientId: patient.id, organizationId: ctx.organizationId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        const addr = {
          addressLine1: dto.address.addressLine1 ?? null,
          addressLine2: dto.address.addressLine2 ?? null,
          city: dto.address.city ?? null,
          state: dto.address.state ?? null,
          country: dto.address.country ?? null,
          postalCode: dto.address.postalCode ?? null,
        };
        if (existing) {
          await tx.patientAddress.update({ where: { id: existing.id }, data: addr });
        } else {
          await tx.patientAddress.create({
            data: { organizationId: ctx.organizationId, branchId: patient.branchId, patientId: patient.id, addressType: 'HOME', ...addr },
          });
        }
      }
    });
    await this.audit.log({
      organizationId: ctx.organizationId,
      action: 'PORTAL_PROFILE_UPDATED',
      resource: 'patient',
      resourceId: patient.id,
      afterData: { fields: Object.keys({ ...data, ...(dto.address ? { address: true } : {}) }) },
    });
    return this.getMe(ctx);
  }

  // ================================================================ appointments

  async listAppointments(ctx: PortalPatientContext) {
    const rows = await this.prisma.appointment.findMany({
      where: { organizationId: ctx.organizationId, patientId: ctx.patientId },
      include: { doctor: { select: { id: true, firstName: true, lastName: true, specialization: true } } },
      orderBy: { scheduledStart: 'desc' },
      take: 500,
    });
    const now = new Date();
    const upcoming = rows
      .filter((a) => a.scheduledStart >= now && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status))
      .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
    const past = rows.filter((a) => !upcoming.includes(a));
    return { upcoming, past };
  }

  async listDoctors(ctx: PortalPatientContext) {
    return this.prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        status: 'ACTIVE',
        roles: { some: { role: { name: 'Doctor' } } },
      },
      select: { id: true, firstName: true, lastName: true, specialization: true, qualification: true, consultationFee: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  private async assertDoctor(doctorId: string, ctx: PortalPatientContext) {
    assertUuid(doctorId, 'doctorId');
    const doctor = await this.prisma.user.findFirst({
      where: {
        id: doctorId,
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        status: 'ACTIVE',
        roles: { some: { role: { name: 'Doctor' } } },
      },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  async doctorSlots(ctx: PortalPatientContext, doctorId: string, date: string) {
    await this.assertDoctor(doctorId, ctx);
    return this.schedule.getSlots(ctx.organizationId, ctx.branchId, doctorId, date);
  }

  async book(ctx: PortalPatientContext, dto: PortalBookAppointmentDto) {
    await this.assertDoctor(dto.doctorId, ctx);
    const start = new Date(dto.scheduledStart);
    const end = new Date(dto.scheduledEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('scheduledStart and scheduledEnd must be valid date-times');
    }
    if (end <= start) throw new BadRequestException('scheduledEnd must be after scheduledStart');
    if (end.getTime() - start.getTime() > MAX_DURATION_MS) throw new BadRequestException('An appointment cannot be longer than 8 hours');
    if (start < new Date()) throw new BadRequestException('Cannot book an appointment in the past');
    await this.assertClinicActive(ctx.organizationId);

    const appointment = await this.prisma.$transaction(async (tx) => {
      // Serialise against concurrent bookings for the same doctor.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'appt:' + dto.doctorId}))`;
      const overlapping = await tx.appointment.findFirst({
        where: {
          organizationId: ctx.organizationId,
          doctorId: dto.doctorId,
          status: { notIn: [...FREE_STATUSES] },
          scheduledStart: { lt: end },
          scheduledEnd: { gt: start },
        },
        select: { id: true },
      });
      if (overlapping) throw new ConflictException('That time slot is no longer available');

      const issues = await this.schedule.scheduleIssues(ctx.organizationId, ctx.branchId, dto.doctorId, start, end);
      if (issues.length) {
        // Patients can never override the clinic / doctor schedule.
        throw new ConflictException(`That time slot is not available: ${issues.join('; ')}`);
      }

      return tx.appointment.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: ctx.branchId,
          patientId: ctx.patientId,
          doctorId: dto.doctorId,
          scheduledStart: start,
          scheduledEnd: end,
          appointmentType: dto.appointmentType ?? null,
          appointmentSource: 'PORTAL',
          notes: dto.notes ?? null,
          status: 'SCHEDULED',
        },
      });
    });

    await this.timeline.record({
      organizationId: ctx.organizationId,
      patientId: ctx.patientId,
      eventType: 'APPOINTMENT_BOOKED',
      eventCategory: 'SYSTEM',
      title: 'Appointment booked online',
      description: 'Booked by the patient via the self-service portal',
      metadata: { appointmentId: appointment.id, source: 'PORTAL' },
    });
    await this.audit.log({
      organizationId: ctx.organizationId,
      action: 'PORTAL_APPOINTMENT_BOOKED',
      resource: 'appointment',
      resourceId: appointment.id,
      afterData: { doctorId: dto.doctorId, scheduledStart: start, scheduledEnd: end },
    });
    return appointment;
  }

  async cancelAppointment(ctx: PortalPatientContext, id: string, reason?: string) {
    assertUuid(id, 'appointmentId');
    const appt = await this.prisma.appointment.findFirst({
      where: { id, organizationId: ctx.organizationId, patientId: ctx.patientId },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (!['SCHEDULED', 'CONFIRMED'].includes(appt.status)) {
      throw new ConflictException(`This appointment is ${appt.status.toLowerCase()} and can no longer be cancelled`);
    }
    if (appt.scheduledStart <= new Date()) {
      throw new ConflictException('Past appointments cannot be cancelled online; please call the clinic');
    }
    const cancellationReason = reason?.trim() || 'Cancelled by patient via portal';
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.update({
        where: { id },
        data: { status: 'CANCELLED', cancellationReason },
      });
      await tx.queueEntry.updateMany({
        where: { appointmentId: id, organizationId: ctx.organizationId, status: { in: ['WAITING', 'CALLED', 'IN_PROGRESS'] } },
        data: { status: 'CANCELLED' },
      });
      return row;
    });
    await this.timeline.record({
      organizationId: ctx.organizationId,
      patientId: ctx.patientId,
      eventType: 'APPOINTMENT_CANCELLED',
      eventCategory: 'SYSTEM',
      title: 'Appointment cancelled online',
      description: cancellationReason,
      metadata: { appointmentId: id, source: 'PORTAL' },
    });
    await this.audit.log({
      organizationId: ctx.organizationId,
      action: 'PORTAL_APPOINTMENT_CANCELLED',
      resource: 'appointment',
      resourceId: id,
      afterData: { reason: cancellationReason },
    });
    return updated;
  }

  // ================================================================ prescriptions

  async listPrescriptions(ctx: PortalPatientContext) {
    return this.prisma.prescription.findMany({
      where: { organizationId: ctx.organizationId, patientId: ctx.patientId },
      include: {
        items: true,
        doctor: { select: { id: true, firstName: true, lastName: true, specialization: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
  }

  private async loadPrescription(ctx: PortalPatientContext, id: string) {
    assertUuid(id, 'prescriptionId');
    const rx = await this.prisma.prescription.findFirst({
      where: { id, organizationId: ctx.organizationId, patientId: ctx.patientId },
      include: {
        items: true,
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, gender: true, dateOfBirth: true, phone: true } },
        doctor: {
          select: { id: true, firstName: true, lastName: true, qualification: true, specialization: true, registrationNumber: true, signatureUrl: true },
        },
      },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  async prescriptionPdf(ctx: PortalPatientContext, id: string) {
    const rx = await this.loadPrescription(ctx, id);
    const org = await this.organizations.findOne(ctx.organizationId, ctx.organizationId);
    const buffer = await this.pdf.generatePrescriptionPdf(rx, org);
    await this.audit.log({
      organizationId: ctx.organizationId,
      action: 'PORTAL_PRESCRIPTION_DOWNLOADED',
      resource: 'prescription',
      resourceId: rx.id,
    });
    return { buffer, filename: `prescription-${rx.id.split('-')[0]}.pdf` };
  }

  // ================================================================ invoices

  private withBalance<T extends { id: string; total: Prisma.Decimal }>(inv: T, net: Prisma.Decimal) {
    const balance = inv.total.minus(net);
    return { ...inv, amountPaid: net.toFixed(2), balance: (balance.lt(0) ? D(0) : balance).toFixed(2) };
  }

  async listInvoices(ctx: PortalPatientContext) {
    const rows = await this.prisma.invoice.findMany({
      where: { organizationId: ctx.organizationId, patientId: ctx.patientId, deletedAt: null },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        subtotal: true,
        discount: true,
        tax: true,
        dueDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const balances = await this.ledger.balances(rows.map((r) => r.id));
    return rows.map((r) => this.withBalance(r, balances.get(r.id)!.net));
  }

  async getInvoice(ctx: PortalPatientContext, id: string) {
    assertUuid(id, 'invoiceId');
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId: ctx.organizationId, patientId: ctx.patientId, deletedAt: null },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        payments: {
          where: { isRefund: false },
          orderBy: { createdAt: 'asc' },
          select: { id: true, amount: true, paymentMethod: true, paymentStatus: true, paidAt: true, createdAt: true },
        },
        branch: { select: { id: true, name: true, address: true, phone: true, email: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const { net } = await this.ledger.balance(invoice.id);
    return this.withBalance(invoice, net);
  }

  async createPayLink(ctx: PortalPatientContext, id: string) {
    assertUuid(id, 'invoiceId');
    if (!this.stripe.isEnabled()) throw new BadRequestException('online payments not configured');
    await this.assertClinicActive(ctx.organizationId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId: ctx.organizationId, patientId: ctx.patientId, deletedAt: null },
      include: { organization: { select: { name: true, currency: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') throw new BadRequestException('This invoice has been voided');
    const { net } = await this.ledger.balance(invoice.id);
    const outstanding = invoice.total.minus(net);
    if (outstanding.lte(0)) throw new BadRequestException('This invoice has no outstanding balance');

    const currency = this.stripe.currency(invoice.organization.currency);
    const base = this.stripe.appBaseUrl();
    const metadata = { organizationId: invoice.organizationId, branchId: invoice.branchId, invoiceId: invoice.id };

    // Best-effort retire a stale open session before minting a fresh one.
    if (invoice.stripeCheckoutSessionId) {
      await this.stripe.expireCheckoutSession(invoice.stripeCheckoutSessionId).catch(() => undefined);
    }

    const session = await this.stripe.createCheckoutSession({
      mode: 'payment',
      client_reference_id: invoice.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toMinorUnits(outstanding, currency),
            product_data: { name: `Invoice ${invoice.invoiceNumber}`, description: invoice.organization.name },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${base}/portal/invoices/${invoice.id}?payment=success`,
      cancel_url: `${base}/portal/invoices/${invoice.id}?payment=cancelled`,
    });
    if (!session.url) throw new BadRequestException('Could not create a payment link');

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        stripeCheckoutSessionId: session.id,
        paymentLinkUrl: session.url,
        ...(invoice.status === 'DRAFT' ? { status: 'SENT' } : {}),
      },
    });
    await this.audit.log({
      organizationId: ctx.organizationId,
      action: 'PORTAL_PAYMENT_LINK_CREATED',
      resource: 'invoice',
      resourceId: invoice.id,
      afterData: { sessionId: session.id, amount: outstanding.toFixed(2), currency },
    });
    return {
      url: session.url,
      amount: outstanding.toFixed(2),
      currency: currency.toUpperCase(),
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    };
  }

  // ================================================================ documents

  async listDocuments(ctx: PortalPatientContext) {
    const rows = await this.prisma.medicalDocument.findMany({
      where: { organizationId: ctx.organizationId, patientId: ctx.patientId },
      select: { id: true, title: true, documentType: true, mimeType: true, fileSize: true, uploadedAt: true, storageKey: true },
      orderBy: { uploadedAt: 'desc' },
      take: 300,
    });
    return rows.map(({ storageKey, ...rest }) => ({ ...rest, hasFile: !!storageKey }));
  }

  async downloadDocument(ctx: PortalPatientContext, id: string, meta: { ip?: string; userAgent?: string } = {}) {
    assertUuid(id, 'documentId');
    const doc = await this.prisma.medicalDocument.findFirst({
      where: { id, organizationId: ctx.organizationId, patientId: ctx.patientId },
      select: { id: true, title: true, mimeType: true, fileSize: true, storageKey: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (!doc.storageKey) throw new NotFoundException('This document has no stored file');
    const stream: Readable = await this.storage.getStream(doc.storageKey);
    await this.audit.log({
      organizationId: ctx.organizationId,
      action: 'PORTAL_DOCUMENT_DOWNLOADED',
      resource: 'medical_document',
      resourceId: doc.id,
      afterData: { title: doc.title },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    const safeTitle = (doc.title || 'document').replace(/[^\w.\- ]+/g, '_').trim() || 'document';
    return { stream, mimeType: doc.mimeType || 'application/octet-stream', fileSize: doc.fileSize, filename: safeTitle };
  }

  // ================================================================ follow-ups

  async listFollowUps(ctx: PortalPatientContext) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return this.prisma.followUp.findMany({
      where: {
        organizationId: ctx.organizationId,
        patientId: ctx.patientId,
        scheduledDate: { gte: startOfToday },
        NOT: { status: { in: ['COMPLETED', 'CANCELLED'] } },
      },
      include: { doctor: { select: { id: true, firstName: true, lastName: true, specialization: true } } },
      orderBy: { scheduledDate: 'asc' },
      take: 100,
    });
  }

  // ================================================================ staff enablement

  async enablePortal(actor: StaffActor, patientId: string, dto: EnablePortalDto) {
    assertUuid(patientId, 'patientId');
    const patient = await this.prisma.patient.findFirst({
      // Branch-level staff may only act on patients in their own branch.
      where: {
        id: patientId,
        organizationId: actor.organizationId,
        status: { not: 'ARCHIVED' },
        ...(actor.orgWide ? {} : { branchId: actor.branchId }),
      },
      select: { id: true, firstName: true, branchId: true, phone: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const mode = dto.mode ?? 'password';
    let temporaryPassword: string | undefined;
    const data: Prisma.PatientUpdateInput = { portalEnabled: true, updatedBy: actor.id };
    if (mode === 'password') {
      temporaryPassword = this.generateTempPassword();
      data.portalPasswordHash = await PortalAuthService.hashPassword(temporaryPassword);
    }
    await this.prisma.patient.update({ where: { id: patient.id }, data });

    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'PORTAL_ENABLED',
      resource: 'patient',
      resourceId: patient.id,
      afterData: { mode },
    });

    return {
      patientId: patient.id,
      portalEnabled: true,
      mode,
      // Returned ONCE for staff to hand to the patient; never stored in clear text.
      ...(temporaryPassword ? { temporaryPassword } : {}),
      message:
        mode === 'password'
          ? 'Portal enabled. Share the temporary password with the patient; they should change it after signing in.'
          : 'Portal enabled. The patient can sign in with a one-time code sent to their phone/email.',
    };
  }

  async disablePortal(actor: StaffActor, patientId: string) {
    assertUuid(patientId, 'patientId');
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        organizationId: actor.organizationId,
        ...(actor.orgWide ? {} : { branchId: actor.branchId }),
      },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id: patient.id },
        data: { portalEnabled: false, portalPasswordHash: null, updatedBy: actor.id },
      });
      // Kill every live session so the patient is logged out everywhere immediately.
      const revoked = await tx.patientPortalSession.updateMany({
        where: { patientId: patient.id, organizationId: actor.organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return revoked.count;
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'PORTAL_DISABLED',
      resource: 'patient',
      resourceId: patient.id,
      afterData: { sessionsRevoked: result },
    });
    return { patientId: patient.id, portalEnabled: false, sessionsRevoked: result };
  }

  private generateTempPassword() {
    // 12 url-safe chars with mixed classes; high entropy, readable enough to dictate.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(12);
    let out = '';
    for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
    return `Px-${out}`;
  }
}
