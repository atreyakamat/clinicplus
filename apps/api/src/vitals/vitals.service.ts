import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { TimelineService } from '../timeline/timeline.service';
import { AuditService } from '../common/services/audit.service';
import { pageArgs, paginated } from '../common/pagination';
import { RequestUser } from '../clinical/clinical-access';
import { assertConsultationOpen, withBmi } from '../consultations/consultation-rules';
import { CreateVitalDto } from './dto/vital.dto';

const MEASURES = [
  'height',
  'weight',
  'temperature',
  'pulse',
  'respiratoryRate',
  'bloodPressureSystolic',
  'bloodPressureDiastolic',
  'spo2',
] as const;

@Injectable()
export class VitalsService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantAssertService,
    private timeline: TimelineService,
    private audit: AuditService,
  ) {}

  /** Records a set of vitals against an open consultation (nurse or doctor). */
  async create(dto: CreateVitalDto, user: RequestUser) {
    const consultation = await this.tenant.consultation(dto.consultationId, user.organizationId, user.branchId);
    assertConsultationOpen(consultation);
    if (!MEASURES.some((k) => dto[k] !== undefined && dto[k] !== null)) {
      throw new BadRequestException('Provide at least one vital measurement');
    }
    if (
      dto.bloodPressureSystolic !== undefined &&
      dto.bloodPressureDiastolic !== undefined &&
      dto.bloodPressureDiastolic >= dto.bloodPressureSystolic
    ) {
      throw new BadRequestException('Diastolic pressure must be lower than systolic pressure');
    }
    const vital = await this.prisma.vital.create({
      data: {
        organizationId: user.organizationId,
        branchId: consultation.branchId,
        consultationId: consultation.id,
        height: dto.height,
        weight: dto.weight,
        temperature: dto.temperature,
        pulse: dto.pulse,
        respiratoryRate: dto.respiratoryRate,
        bloodPressureSystolic: dto.bloodPressureSystolic,
        bloodPressureDiastolic: dto.bloodPressureDiastolic,
        spo2: dto.spo2,
      },
    });
    const result = withBmi(vital);
    const parts: string[] = [];
    if (vital.bloodPressureSystolic && vital.bloodPressureDiastolic)
      parts.push(`BP ${vital.bloodPressureSystolic}/${vital.bloodPressureDiastolic}`);
    if (vital.pulse) parts.push(`Pulse ${vital.pulse}`);
    if (vital.temperature) parts.push(`Temp ${vital.temperature}°C`);
    if (vital.spo2) parts.push(`SpO2 ${vital.spo2}%`);
    if (result.bmi) parts.push(`BMI ${result.bmi}`);
    await this.timeline.emit('VITALS_RECORDED', {
      organizationId: user.organizationId,
      patientId: consultation.patientId,
      title: 'Vitals recorded',
      description: parts.join(' · ') || undefined,
      metadata: { consultationId: consultation.id, vitalId: vital.id },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'vital',
      resourceId: vital.id,
      afterData: vital,
    });
    return result;
  }

  async forConsultation(consultationId: string, user: RequestUser) {
    await this.tenant.consultation(consultationId, user.organizationId, user.branchId);
    const rows = await this.prisma.vital.findMany({
      where: { consultationId, organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(withBmi);
  }

  /** Vitals history across all of a patient's consultations (newest first), with BMI. */
  async patientHistory(patientId: string, user: RequestUser, q: { page?: number; limit?: number }) {
    await this.tenant.patient(patientId, user.organizationId, user.branchId);
    const { page, limit, skip, take } = pageArgs(q);
    const where = { organizationId: user.organizationId, consultation: { patientId } };
    const [rows, total] = await Promise.all([
      this.prisma.vital.findMany({
        where,
        include: { consultation: { select: { id: true, consultationDate: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.vital.count({ where }),
    ]);
    return paginated(rows.map(withBmi), total, page, limit);
  }
}
