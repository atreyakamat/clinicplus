import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { assertUuid } from '../common/validation/uuid';
import { RequestUser } from './clinical-access';
import { CreateAllergyDto, CreateConditionDto, UpdateAllergyDto, UpdateConditionDto } from './dto/clinical.dto';

type Db = PrismaService | Prisma.TransactionClient;

/** Allergies, chronic conditions and the medical-history summary of a patient. */
@Injectable()
export class ClinicalService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantAssertService,
    private audit: AuditService,
    private timeline: TimelineService,
  ) {}

  // ---------------------------------------------------------------- allergies

  /** Patient allergies (caller must already have verified the patient belongs to the tenant). */
  async allergiesFor(patientId: string, organizationId: string, db: Db = this.prisma) {
    return db.allergy.findMany({
      where: { patientId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAllergies(patientId: string, user: RequestUser) {
    await this.tenant.patient(patientId, user.organizationId, user.branchId);
    return this.allergiesFor(patientId, user.organizationId);
  }

  async addAllergy(patientId: string, dto: CreateAllergyDto, user: RequestUser) {
    const patient = await this.tenant.patient(patientId, user.organizationId, user.branchId);
    const name = dto.allergyName.trim();
    const existing = await this.prisma.allergy.findFirst({
      where: { patientId, organizationId: user.organizationId, allergyName: { equals: name, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException(`Allergy "${name}" is already recorded for this patient`);
    const allergy = await this.prisma.allergy.create({
      data: {
        organizationId: user.organizationId,
        branchId: patient.branchId,
        patientId,
        allergyName: name,
        severity: dto.severity,
        notes: dto.notes,
      },
    });
    await this.timeline.emit('ALLERGY_ADDED', {
      organizationId: user.organizationId,
      patientId,
      title: `Allergy recorded: ${allergy.allergyName}`,
      description: allergy.severity ? `Severity: ${allergy.severity}` : undefined,
      metadata: { allergyId: allergy.id },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'allergy',
      resourceId: allergy.id,
      afterData: allergy,
    });
    return allergy;
  }

  private async findAllergy(id: string, user: RequestUser) {
    assertUuid(id, 'allergyId');
    const row = await this.prisma.allergy.findFirst({
      where: { id, organizationId: user.organizationId, patient: { branchId: user.branchId } },
    });
    if (!row) throw new NotFoundException('Allergy not found');
    return row;
  }

  async updateAllergy(id: string, dto: UpdateAllergyDto, user: RequestUser) {
    const before = await this.findAllergy(id, user);
    const updated = await this.prisma.allergy.update({
      where: { id },
      data: {
        ...(dto.allergyName !== undefined ? { allergyName: dto.allergyName.trim() } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'allergy',
      resourceId: id,
      beforeData: before,
      afterData: updated,
    });
    return updated;
  }

  async removeAllergy(id: string, user: RequestUser) {
    const before = await this.findAllergy(id, user);
    await this.prisma.allergy.delete({ where: { id } });
    await this.timeline.emit('ALLERGY_REMOVED', {
      organizationId: user.organizationId,
      patientId: before.patientId,
      title: `Allergy removed: ${before.allergyName}`,
      metadata: { allergyId: id },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'DELETE',
      resource: 'allergy',
      resourceId: id,
      beforeData: before,
    });
    return { id, deleted: true };
  }

  // --------------------------------------------------------------- conditions

  async conditionsFor(patientId: string, organizationId: string, db: Db = this.prisma) {
    return db.medicalCondition.findMany({
      where: { patientId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listConditions(patientId: string, user: RequestUser) {
    await this.tenant.patient(patientId, user.organizationId, user.branchId);
    return this.conditionsFor(patientId, user.organizationId);
  }

  async addCondition(patientId: string, dto: CreateConditionDto, user: RequestUser) {
    const patient = await this.tenant.patient(patientId, user.organizationId, user.branchId);
    const condition = await this.prisma.medicalCondition.create({
      data: {
        organizationId: user.organizationId,
        branchId: patient.branchId,
        patientId,
        conditionName: dto.conditionName.trim(),
        diagnosedDate: dto.diagnosedDate ? new Date(dto.diagnosedDate) : undefined,
        status: dto.status ?? 'ACTIVE',
      },
    });
    await this.timeline.emit('CONDITION_ADDED', {
      organizationId: user.organizationId,
      patientId,
      title: `Medical condition recorded: ${condition.conditionName}`,
      metadata: { conditionId: condition.id },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'medical_condition',
      resourceId: condition.id,
      afterData: condition,
    });
    return condition;
  }

  private async findCondition(id: string, user: RequestUser) {
    assertUuid(id, 'conditionId');
    const row = await this.prisma.medicalCondition.findFirst({
      where: { id, organizationId: user.organizationId, patient: { branchId: user.branchId } },
    });
    if (!row) throw new NotFoundException('Medical condition not found');
    return row;
  }

  async updateCondition(id: string, dto: UpdateConditionDto, user: RequestUser) {
    const before = await this.findCondition(id, user);
    const updated = await this.prisma.medicalCondition.update({
      where: { id },
      data: {
        ...(dto.conditionName !== undefined ? { conditionName: dto.conditionName.trim() } : {}),
        ...(dto.diagnosedDate !== undefined ? { diagnosedDate: new Date(dto.diagnosedDate) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    if (dto.status && dto.status !== before.status) {
      await this.timeline.emit('CONDITION_UPDATED', {
        organizationId: user.organizationId,
        patientId: before.patientId,
        title: `${updated.conditionName}: ${before.status ?? 'ACTIVE'} → ${updated.status}`,
        metadata: { conditionId: id },
        createdBy: user.id,
      });
    }
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'medical_condition',
      resourceId: id,
      beforeData: before,
      afterData: updated,
    });
    return updated;
  }

  async removeCondition(id: string, user: RequestUser) {
    const before = await this.findCondition(id, user);
    await this.prisma.medicalCondition.delete({ where: { id } });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'DELETE',
      resource: 'medical_condition',
      resourceId: id,
      beforeData: before,
    });
    return { id, deleted: true };
  }

  // ------------------------------------------------------------------ history

  /** One-shot medical history: allergies, conditions, past diagnoses, medication history. */
  async history(patientId: string, user: RequestUser) {
    await this.tenant.patient(patientId, user.organizationId, user.branchId);
    const org = user.organizationId;
    const [allergies, conditions, diagnoses, prescriptions, consultations] = await Promise.all([
      this.allergiesFor(patientId, org),
      this.conditionsFor(patientId, org),
      this.prisma.diagnosis.findMany({
        where: { organizationId: org, consultation: { patientId } },
        include: { consultation: { select: { id: true, consultationDate: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.prescription.findMany({
        where: { organizationId: org, patientId },
        include: { items: true, doctor: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { issuedAt: 'desc' },
        take: 50,
      }),
      this.prisma.consultation.findMany({
        where: { organizationId: org, patientId, deletedAt: null },
        select: {
          id: true,
          consultationDate: true,
          status: true,
          chiefComplaint: true,
          doctor: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { consultationDate: 'desc' },
        take: 20,
      }),
    ]);
    return {
      allergies,
      conditions,
      pastDiagnoses: diagnoses.map((d) => ({
        id: d.id,
        icdCode: d.icdCode,
        diagnosisName: d.diagnosisName,
        severity: d.severity,
        consultationId: d.consultationId,
        date: d.consultation.consultationDate,
      })),
      medicationHistory: prescriptions.flatMap((p) =>
        p.items.map((i) => ({
          prescriptionId: p.id,
          status: p.status,
          issuedAt: p.issuedAt,
          doctor: p.doctor,
          medicineName: i.medicineName,
          dosage: i.dosage,
          frequency: i.frequency,
          duration: i.duration,
        })),
      ),
      consultations,
    };
  }
}
