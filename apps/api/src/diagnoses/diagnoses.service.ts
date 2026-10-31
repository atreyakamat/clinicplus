import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { TimelineService } from '../timeline/timeline.service';
import { AuditService } from '../common/services/audit.service';
import { assertUuid } from '../common/validation/uuid';
import { RequestUser } from '../clinical/clinical-access';
import { assertConsultationOpen, assertConsultationOwner } from '../consultations/consultation-rules';
import { CreateDiagnosisDto, UpdateDiagnosisDto } from './dto/diagnosis.dto';

@Injectable()
export class DiagnosesService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantAssertService,
    private timeline: TimelineService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateDiagnosisDto, user: RequestUser) {
    const c = await this.tenant.consultation(dto.consultationId, user.organizationId, user.branchId);
    assertConsultationOwner(c, user);
    assertConsultationOpen(c);
    const diagnosis = await this.prisma.diagnosis.create({
      data: {
        organizationId: user.organizationId,
        branchId: c.branchId,
        consultationId: c.id,
        icdCode: dto.icdCode?.toUpperCase(),
        diagnosisName: dto.diagnosisName.trim(),
        severity: dto.severity,
        notes: dto.notes,
      },
    });
    await this.timeline.emit('DIAGNOSIS_ADDED', {
      organizationId: user.organizationId,
      patientId: c.patientId,
      title: `Diagnosis: ${diagnosis.diagnosisName}${diagnosis.icdCode ? ` (${diagnosis.icdCode})` : ''}`,
      metadata: { consultationId: c.id, diagnosisId: diagnosis.id },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'diagnosis',
      resourceId: diagnosis.id,
      afterData: diagnosis,
    });
    return diagnosis;
  }

  private async loadEditable(id: string, user: RequestUser) {
    assertUuid(id, 'diagnosisId');
    const d = await this.prisma.diagnosis.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId },
      include: { consultation: true },
    });
    if (!d) throw new NotFoundException('Diagnosis not found');
    assertConsultationOwner(d.consultation, user);
    assertConsultationOpen(d.consultation);
    return d;
  }

  async update(id: string, dto: UpdateDiagnosisDto, user: RequestUser) {
    const before = await this.loadEditable(id, user);
    const updated = await this.prisma.diagnosis.update({
      where: { id },
      data: {
        ...(dto.icdCode !== undefined ? { icdCode: dto.icdCode ? dto.icdCode.toUpperCase() : null } : {}),
        ...(dto.diagnosisName !== undefined ? { diagnosisName: dto.diagnosisName.trim() } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    const { consultation, ...beforeRow } = before;
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'diagnosis',
      resourceId: id,
      beforeData: beforeRow,
      afterData: updated,
    });
    return updated;
  }

  async remove(id: string, user: RequestUser) {
    const before = await this.loadEditable(id, user);
    await this.prisma.diagnosis.delete({ where: { id } });
    const { consultation, ...beforeRow } = before;
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'DELETE',
      resource: 'diagnosis',
      resourceId: id,
      beforeData: beforeRow,
    });
    return { id, deleted: true };
  }

  async list(q: { consultationId?: string; patientId?: string }, user: RequestUser) {
    if (q.consultationId) {
      await this.tenant.consultation(q.consultationId, user.organizationId, user.branchId);
      return this.prisma.diagnosis.findMany({
        where: { consultationId: q.consultationId, organizationId: user.organizationId },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (q.patientId) {
      await this.tenant.patient(q.patientId, user.organizationId, user.branchId);
      return this.prisma.diagnosis.findMany({
        where: { organizationId: user.organizationId, consultation: { patientId: q.patientId } },
        include: { consultation: { select: { id: true, consultationDate: true, doctorId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    }
    throw new BadRequestException('consultationId or patientId is required');
  }
}
