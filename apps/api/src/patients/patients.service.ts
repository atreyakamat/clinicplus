import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { TimelineService } from '../timeline/timeline.service';
import { AuditService } from '../common/services/audit.service';

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private auditService: AuditService,
  ) {}

  private validateUuid(id: string) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundException(`Invalid ID format: ${id}`);
    }
  }

  async create(data: any) {
    const organizationId = data.organizationId;

    // 1. Duplicate Detection (F-007)
    const existing = await this.prisma.patient.findFirst({
      where: {
        organizationId,
        OR: [{ email: data.email || 'none' }, { phone: data.phone || 'none' }],
      },
    });

    if (existing) {
      throw new ConflictException(
        'Patient with this email or phone already exists in this clinic',
      );
    }

    // 2. Patient ID Generation (F-007)
    const count = await this.prisma.patient.count({
      where: { organizationId },
    });
    const patientCode =
      data.patientCode || `PAT-${(count + 1).toString().padStart(6, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          ...data,
          patientCode,
        },
      });

      // 3. Timeline Recording (F-010)
      await this.timeline.record({
        organizationId: patient.organizationId,
        patientId: patient.id,
        eventType: 'PATIENT_REGISTERED',
        eventCategory: 'PATIENT',
        title: 'Patient Registered',
        description: `Patient ${patient.firstName} ${patient.lastName} was registered in the system.`,
        createdBy: data.createdBy,
      });

      // 4. Audit Log
      await this.auditService.log({
        organizationId: patient.organizationId,
        userId: data.createdBy,
        action: 'CREATE',
        resource: 'patient',
        resourceId: patient.id,
        afterData: patient,
      });

      return patient;
    });
  }

  async findAll(organizationId: string, branchId: string) {
    return this.prisma.patient.findMany({
      where: {
        organizationId,
        branchId,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    this.validateUuid(id);
    const patient = await this.prisma.patient.findUnique({
      where: { id, organizationId, branchId },
      include: {
        addresses: true,
        emergencyContacts: true,
        familyMembers: true,
        tags: true,
        notes: true,
        appointments: {
          include: {
            doctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: {
            scheduledStart: 'desc',
          },
        },
        consultations: {
          include: {
            doctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            diagnoses: true,
          },
          orderBy: {
            consultationDate: 'desc',
          },
        },
        prescriptions: {
          include: {
            doctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            items: true,
          },
          orderBy: {
            issuedAt: 'desc',
          },
        },
        invoices: {
          include: {
            items: true,
            payments: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        documents: {
          include: {
            uploader: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }
    return patient;
  }

  async update(
    id: string,
    data: any,
    organizationId: string,
    branchId: string,
  ) {
    this.validateUuid(id);

    // Get old data for audit
    const oldPatient = await this.findOne(id, organizationId, branchId);

    const patient = await this.prisma.patient.update({
      where: { id },
      data,
    });

    await this.timeline.record({
      organizationId: patient.organizationId,
      patientId: patient.id,
      eventType: 'PATIENT_UPDATED',
      eventCategory: 'PATIENT',
      title: 'Profile Updated',
      description: 'Patient personal information was updated.',
      createdBy: data.updatedBy,
    });

    // Audit Log
    await this.auditService.log({
      organizationId: patient.organizationId,
      userId: data.updatedBy,
      action: 'UPDATE',
      resource: 'patient',
      resourceId: patient.id,
      beforeData: oldPatient,
      afterData: patient,
    });

    return patient;
  }

  async remove(
    id: string,
    organizationId: string,
    branchId: string,
    removedBy: string,
  ) {
    this.validateUuid(id);

    // Get old data for audit
    const oldPatient = await this.findOne(id, organizationId, branchId);

    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        status: 'INACTIVE',
        deletedAt: new Date(),
      },
    });

    await this.timeline.record({
      organizationId: patient.organizationId,
      patientId: patient.id,
      eventType: 'PATIENT_ARCHIVED',
      eventCategory: 'PATIENT',
      title: 'Patient Archived',
      description: 'Patient record was marked as inactive.',
    });

    // Audit Log
    await this.auditService.log({
      organizationId: patient.organizationId,
      userId: removedBy,
      action: 'DELETE',
      resource: 'patient',
      resourceId: patient.id,
      beforeData: oldPatient,
      afterData: patient,
    });

    return patient;
  }

  async search(organizationId: string, query: string) {
    if (!query || query.length < 2) return [];
    return this.prisma.patient.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
          { patientCode: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
    });
  }

  async addNote(patientId: string, noteData: any) {
    this.validateUuid(patientId);
    return this.prisma.patientNote.create({
      data: {
        ...noteData,
        patientId,
      },
    });
  }
}
