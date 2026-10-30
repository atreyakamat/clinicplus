import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import { RequestUser } from '../clinical/clinical-access';
import { CONSULTATION_LOCKED_MESSAGE } from '../consultations/consultation-rules';
import { checkPrescriptionSafety, SafetyWarning } from './prescription-safety';
import {
  CancelPrescriptionDto,
  CreatePrescriptionDto,
  ListPrescriptionsQueryDto,
  PrescriptionItemDto,
  UpdatePrescriptionDto,
} from './dto/prescription.dto';

export const SAFETY_WARNINGS_ERROR = 'SAFETY_WARNINGS';

const doctorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  qualification: true,
  specialization: true,
  registrationNumber: true,
  signatureUrl: true,
};

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantAssertService,
    private audit: AuditService,
    private timeline: TimelineService,
  ) {}

  /** Runs allergy + duplicate-therapy checks for the patient (no writes). */
  async safetyCheck(
    patientId: string,
    items: { medicineName: string }[],
    user: RequestUser,
    excludePrescriptionId?: string,
  ): Promise<SafetyWarning[]> {
    await this.tenant.patient(patientId, user.organizationId, user.branchId);
    const [allergies, active] = await Promise.all([
      this.prisma.allergy.findMany({ where: { patientId, organizationId: user.organizationId } }),
      this.prisma.prescription.findMany({
        where: {
          patientId,
          organizationId: user.organizationId,
          status: 'ACTIVE',
          ...(excludePrescriptionId ? { id: { not: excludePrescriptionId } } : {}),
        },
        include: { items: true },
      }),
    ]);
    const activeItems = active.flatMap((p) =>
      p.items.map((i) => ({ medicineName: i.medicineName, prescriptionId: p.id })),
    );
    return checkPrescriptionSafety(items, allergies, activeItems);
  }

  private enforceAcknowledged(warnings: SafetyWarning[], acknowledged?: boolean) {
    if (warnings.length && !acknowledged) {
      throw new ConflictException({
        error: SAFETY_WARNINGS_ERROR,
        message: `Prescription has safety warnings that must be acknowledged: ${warnings
          .map((w) => w.message)
          .join('; ')}`,
      });
    }
  }

  private itemRows(items: PrescriptionItemDto[], organizationId: string, branchId: string) {
    return items.map((i) => ({
      organizationId,
      branchId,
      medicineName: i.medicineName.trim(),
      dosage: i.dosage,
      frequency: i.frequency,
      duration: i.duration,
      instructions: i.instructions,
    }));
  }

  async create(dto: CreatePrescriptionDto, user: RequestUser) {
    const patient = await this.tenant.patient(dto.patientId, user.organizationId, user.branchId);
    if (dto.consultationId) {
      const c = await this.tenant.consultation(dto.consultationId, user.organizationId, user.branchId);
      if (c.patientId !== patient.id) throw new BadRequestException('Consultation does not belong to this patient');
      if (c.doctorId !== user.id) throw new ForbiddenException('Only the consulting doctor can prescribe on this consultation');
      if (c.status === 'COMPLETED') throw new ConflictException(CONSULTATION_LOCKED_MESSAGE);
    }
    const warnings = await this.safetyCheck(patient.id, dto.items, user);
    this.enforceAcknowledged(warnings, dto.acknowledgeWarnings);

    const rx = await this.prisma.prescription.create({
      data: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        patientId: patient.id,
        doctorId: user.id,
        consultationId: dto.consultationId,
        notes: dto.notes,
        status: 'ACTIVE',
        items: { create: this.itemRows(dto.items, user.organizationId, user.branchId) },
      },
      include: { items: true },
    });
    await this.timeline.emit('PRESCRIPTION_ISSUED', {
      organizationId: user.organizationId,
      patientId: patient.id,
      title: `Prescription issued (${rx.items.length} medicine${rx.items.length === 1 ? '' : 's'})`,
      description: rx.items.map((i) => i.medicineName).join(', '),
      metadata: { prescriptionId: rx.id, consultationId: rx.consultationId, acknowledgedWarnings: warnings.length },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'prescription',
      resourceId: rx.id,
      afterData: { ...rx, acknowledgedWarnings: warnings },
    });
    return { ...rx, warnings };
  }

  async findAll(user: RequestUser, q: ListPrescriptionsQueryDto) {
    const { page, limit, skip, take } = pageArgs(q);
    const where: Prisma.PrescriptionWhereInput = {
      organizationId: user.organizationId,
      branchId: user.branchId,
      ...(q.patientId ? { patientId: q.patientId } : {}),
      ...(q.doctorId ? { doctorId: q.doctorId } : {}),
      ...(q.consultationId ? { consultationId: q.consultationId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        include: {
          items: true,
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          doctor: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { issuedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.prescription.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  async findOne(id: string, user: RequestUser) {
    assertUuid(id, 'prescriptionId');
    const rx = await this.prisma.prescription.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId },
      include: {
        items: true,
        patient: {
          select: {
            id: true,
            patientCode: true,
            firstName: true,
            lastName: true,
            gender: true,
            dateOfBirth: true,
            phone: true,
          },
        },
        doctor: { select: doctorSelect },
        consultation: { select: { id: true, consultationDate: true, status: true } },
      },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    return { ...rx, canEdit: rx.status === 'ACTIVE' && rx.doctorId === user.id };
  }

  private async loadOwnActive(id: string, user: RequestUser) {
    const rx = await this.findOne(id, user);
    if (rx.doctorId !== user.id) throw new ForbiddenException('Only the prescribing doctor can change this prescription');
    if (rx.status !== 'ACTIVE') throw new ConflictException(`Prescription is ${rx.status.toLowerCase()} and can no longer be changed`);
    return rx;
  }

  async update(id: string, dto: UpdatePrescriptionDto, user: RequestUser) {
    const before = await this.loadOwnActive(id, user);
    let warnings: SafetyWarning[] = [];
    if (dto.items) {
      warnings = await this.safetyCheck(before.patientId, dto.items, user, id);
      this.enforceAcknowledged(warnings, dto.acknowledgeWarnings);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.prescriptionItem.deleteMany({ where: { prescriptionId: id } });
        await tx.prescriptionItem.createMany({
          data: this.itemRows(dto.items, before.organizationId, before.branchId).map((r) => ({ ...r, prescriptionId: id })),
        });
      }
      return tx.prescription.update({
        where: { id },
        data: { ...(dto.notes !== undefined ? { notes: dto.notes } : {}) },
        include: { items: true },
      });
    });
    await this.timeline.emit('PRESCRIPTION_UPDATED', {
      organizationId: user.organizationId,
      patientId: before.patientId,
      title: 'Prescription updated',
      description: updated.items.map((i) => i.medicineName).join(', '),
      metadata: { prescriptionId: id },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'prescription',
      resourceId: id,
      beforeData: { notes: before.notes, items: before.items },
      afterData: { notes: updated.notes, items: updated.items, acknowledgedWarnings: warnings },
    });
    return { ...updated, warnings };
  }

  async cancel(id: string, dto: CancelPrescriptionDto, user: RequestUser) {
    const before = await this.loadOwnActive(id, user);
    const updated = await this.prisma.prescription.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason },
      include: { items: true },
    });
    await this.timeline.emit('PRESCRIPTION_CANCELLED', {
      organizationId: user.organizationId,
      patientId: before.patientId,
      title: 'Prescription cancelled',
      description: `Reason: ${dto.reason}`,
      metadata: { prescriptionId: id },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CANCEL',
      resource: 'prescription',
      resourceId: id,
      beforeData: { status: before.status },
      afterData: { status: 'CANCELLED', cancelReason: dto.reason },
    });
    return updated;
  }

  /** Marks a course as finished so it stops counting as an active medication. */
  async complete(id: string, user: RequestUser) {
    const before = await this.loadOwnActive(id, user);
    const updated = await this.prisma.prescription.update({
      where: { id },
      data: { status: 'COMPLETED' },
      include: { items: true },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'COMPLETE',
      resource: 'prescription',
      resourceId: id,
      beforeData: { status: before.status },
      afterData: { status: 'COMPLETED' },
    });
    return updated;
  }

  /** Current medications: items of the patient's ACTIVE prescriptions. */
  async activeMedications(patientId: string, user: RequestUser) {
    await this.tenant.patient(patientId, user.organizationId, user.branchId);
    const rx = await this.prisma.prescription.findMany({
      where: { patientId, organizationId: user.organizationId, status: 'ACTIVE' },
      include: { items: true, doctor: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { issuedAt: 'desc' },
    });
    return rx.flatMap((p) =>
      p.items.map((i) => ({
        id: i.id,
        prescriptionId: p.id,
        medicineName: i.medicineName,
        dosage: i.dosage,
        frequency: i.frequency,
        duration: i.duration,
        instructions: i.instructions,
        issuedAt: p.issuedAt,
        doctor: p.doctor,
      })),
    );
  }
}
