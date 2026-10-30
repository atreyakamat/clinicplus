import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import { RequestUser, userCan } from '../clinical/clinical-access';
import { assertConsultationOpen, assertConsultationOwner, withBmi } from './consultation-rules';
import {
  ConsultationAddendumDto,
  CreateConsultationDto,
  ListConsultationsQueryDto,
  UpdateConsultationDto,
} from './dto/consultation.dto';

const doctorSelect = { id: true, firstName: true, lastName: true, specialization: true, qualification: true };
const patientSelect = {
  id: true,
  patientCode: true,
  firstName: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
  bloodGroup: true,
};

@Injectable()
export class ConsultationsService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantAssertService,
    private audit: AuditService,
    private timeline: TimelineService,
  ) {}

  async create(dto: CreateConsultationDto, user: RequestUser) {
    const patient = await this.tenant.patient(dto.patientId, user.organizationId, user.branchId);
    if (dto.appointmentId) {
      const appt = await this.tenant.appointment(dto.appointmentId, user.organizationId, user.branchId);
      if (appt.patientId !== patient.id) {
        throw new BadRequestException('Appointment does not belong to this patient');
      }
      // Starting a consultation for an appointment is idempotent.
      const existing = await this.prisma.consultation.findFirst({
        where: { appointmentId: appt.id, organizationId: user.organizationId, deletedAt: null },
      });
      if (existing) return existing;
    }

    const consultation = await this.prisma.consultation.create({
      data: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        patientId: patient.id,
        doctorId: user.id,
        appointmentId: dto.appointmentId,
        chiefComplaint: dto.chiefComplaint,
        historyOfPresentIllness: dto.historyOfPresentIllness,
        clinicalAssessment: dto.clinicalAssessment,
        treatmentPlan: dto.treatmentPlan,
        createdBy: user.id,
      },
    });
    await this.timeline.emit('CONSULTATION_STARTED', {
      organizationId: user.organizationId,
      patientId: patient.id,
      title: 'Consultation started',
      description: dto.chiefComplaint ? `Chief complaint: ${dto.chiefComplaint}` : undefined,
      metadata: { consultationId: consultation.id },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'consultation',
      resourceId: consultation.id,
      afterData: consultation,
    });
    return consultation;
  }

  async findAll(user: RequestUser, q: ListConsultationsQueryDto) {
    const { page, limit, skip, take } = pageArgs(q);
    const where: Prisma.ConsultationWhereInput = {
      organizationId: user.organizationId,
      branchId: user.branchId,
      deletedAt: null,
      ...(q.patientId ? { patientId: q.patientId } : {}),
      ...(q.doctorId ? { doctorId: q.doctorId } : {}),
      ...(q.mine === 'true' ? { doctorId: user.id } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to
        ? {
            consultationDate: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
      ...(q.q
        ? {
            patient: {
              OR: [
                { firstName: { contains: q.q, mode: 'insensitive' } },
                { lastName: { contains: q.q, mode: 'insensitive' } },
                { patientCode: { contains: q.q, mode: 'insensitive' } },
                { phone: { contains: q.q } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.consultation.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          doctor: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { diagnoses: true, prescriptions: true } },
        },
        orderBy: { consultationDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.consultation.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  /** Loads a consultation of the caller's tenant + active branch, or 404. */
  async load(id: string, user: RequestUser) {
    assertUuid(id, 'consultationId');
    const c = await this.prisma.consultation.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId, deletedAt: null },
    });
    if (!c) throw new NotFoundException('Consultation not found');
    return c;
  }

  async findOne(id: string, user: RequestUser) {
    await this.load(id, user);
    const c = await this.prisma.consultation.findFirst({
      where: { id },
      include: {
        patient: { select: patientSelect },
        doctor: { select: doctorSelect },
        appointment: { select: { id: true, scheduledStart: true, status: true } },
        diagnoses: { orderBy: { createdAt: 'asc' } },
        vitals: { orderBy: { createdAt: 'desc' } },
        prescriptions: { include: { items: true }, orderBy: { issuedAt: 'desc' } },
        followUps: true,
      },
    });
    const { vitals, diagnoses, prescriptions, ...rest } = c!;
    return {
      ...rest,
      ...(userCan(user, 'vitals.view') ? { vitals: vitals.map(withBmi) } : {}),
      ...(userCan(user, 'diagnoses.view') ? { diagnoses } : {}),
      ...(userCan(user, 'prescriptions.view') ? { prescriptions } : {}),
      canEdit: rest.status === 'DRAFT' && rest.doctorId === user.id,
    };
  }

  /** Everything the consultation workspace screen needs in one call. */
  async workspace(id: string, user: RequestUser) {
    const consultation = await this.findOne(id, user);
    const org = user.organizationId;
    const patientId = consultation.patientId;
    const clinical = userCan(user, 'clinical.view');
    const canRx = userCan(user, 'prescriptions.view');

    const [allergies, conditions, previous, activeRx, addenda] = await Promise.all([
      clinical
        ? this.prisma.allergy.findMany({ where: { organizationId: org, patientId }, orderBy: { createdAt: 'desc' } })
        : Promise.resolve(undefined),
      clinical
        ? this.prisma.medicalCondition.findMany({ where: { organizationId: org, patientId }, orderBy: { createdAt: 'desc' } })
        : Promise.resolve(undefined),
      this.prisma.consultation.findMany({
        where: { organizationId: org, patientId, id: { not: id }, deletedAt: null },
        select: {
          id: true,
          consultationDate: true,
          status: true,
          chiefComplaint: true,
          doctor: { select: { id: true, firstName: true, lastName: true } },
          diagnoses: { select: { diagnosisName: true, icdCode: true } },
        },
        orderBy: { consultationDate: 'desc' },
        take: 5,
      }),
      canRx
        ? this.prisma.prescription.findMany({
            where: { organizationId: org, patientId, status: 'ACTIVE' },
            include: { items: true },
            orderBy: { issuedAt: 'desc' },
          })
        : Promise.resolve(undefined),
      this.addenda(id, org, patientId),
    ]);

    return {
      consultation,
      patient: consultation.patient,
      vitals: (consultation as any).vitals,
      diagnoses: (consultation as any).diagnoses,
      prescriptions: (consultation as any).prescriptions,
      allergies,
      conditions,
      activeMedications: activeRx?.flatMap((p) =>
        p.items.map((i) => ({ ...i, prescriptionId: p.id, issuedAt: p.issuedAt, doctorId: p.doctorId })),
      ),
      previousConsultations: previous,
      addenda,
      canEdit: consultation.canEdit,
    };
  }

  private async addenda(consultationId: string, organizationId: string, patientId: string) {
    const rows = await this.prisma.timelineEvent.findMany({
      where: {
        organizationId,
        patientId,
        eventType: 'CONSULTATION_ADDENDUM',
        metadata: { path: ['consultationId'], equals: consultationId },
      },
      orderBy: { createdAt: 'asc' },
    });
    const authorIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as string[];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds }, organizationId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    return rows.map((r) => ({
      id: r.id,
      note: (r.metadata as any)?.note ?? r.description,
      createdAt: r.createdAt,
      author: authors.find((a) => a.id === r.createdBy) ?? null,
    }));
  }

  async update(id: string, dto: UpdateConsultationDto, user: RequestUser) {
    const before = await this.load(id, user);
    assertConsultationOwner(before, user);
    assertConsultationOpen(before);
    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        chiefComplaint: dto.chiefComplaint,
        historyOfPresentIllness: dto.historyOfPresentIllness,
        clinicalAssessment: dto.clinicalAssessment,
        treatmentPlan: dto.treatmentPlan,
        updatedBy: user.id,
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'consultation',
      resourceId: id,
      beforeData: before,
      afterData: updated,
    });
    return updated;
  }

  async complete(id: string, user: RequestUser) {
    const before = await this.load(id, user);
    assertConsultationOwner(before, user);
    assertConsultationOpen(before);
    const diagnoses = await this.prisma.diagnosis.findMany({ where: { consultationId: id } });
    const updated = await this.prisma.consultation.update({
      where: { id },
      data: { status: 'COMPLETED', updatedBy: user.id },
    });
    // Close the visit: the linked appointment is done once its consultation is.
    // Only open states move; cancelled / no-show appointments are left untouched.
    if (before.appointmentId) {
      await this.prisma.appointment.updateMany({
        where: {
          id: before.appointmentId,
          organizationId: user.organizationId,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] },
        },
        data: { status: 'COMPLETED', updatedBy: user.id },
      });
    }
    await this.timeline.emit('CONSULTATION_COMPLETED', {
      organizationId: user.organizationId,
      patientId: before.patientId,
      title: 'Consultation completed',
      description: diagnoses.length
        ? `Diagnosis: ${diagnoses.map((d) => d.diagnosisName + (d.icdCode ? ` (${d.icdCode})` : '')).join(', ')}`
        : before.chiefComplaint ?? undefined,
      metadata: { consultationId: id, diagnosisCount: diagnoses.length },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'COMPLETE',
      resource: 'consultation',
      resourceId: id,
      beforeData: { status: before.status },
      afterData: { status: updated.status },
    });
    return updated;
  }

  /** The only change allowed on a completed consultation: an attributed, timestamped addendum. */
  async addAddendum(id: string, dto: ConsultationAddendumDto, user: RequestUser) {
    const c = await this.load(id, user);
    assertConsultationOwner(c, user);
    if (c.status !== 'COMPLETED') {
      throw new BadRequestException('Addenda are only for completed consultations; edit the draft instead');
    }
    const event = await this.timeline.emit('CONSULTATION_ADDENDUM', {
      organizationId: user.organizationId,
      patientId: c.patientId,
      title: 'Consultation addendum',
      description: dto.note,
      metadata: { consultationId: id, note: dto.note },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'ADDENDUM',
      resource: 'consultation',
      resourceId: id,
      afterData: { note: dto.note },
    });
    return { id: event.id, consultationId: id, note: dto.note, createdAt: event.createdAt };
  }
}
