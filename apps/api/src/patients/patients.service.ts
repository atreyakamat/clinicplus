import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { TimelineService } from '../timeline/timeline.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
  ) {}

    async create(createPatientDto: CreatePatientDto, organizationId: string, branchId: string, createdBy: string) {
        // 1. Duplicate Detection (F-007)
        const existing = await this.prisma.patient.findFirst({
            where: {
                organizationId,
                OR: [
                    { email: createPatientDto.email || 'none' },
                    { phone: createPatientDto.phone || 'none' }
                ]
            }
        });

        if (existing) {
            throw new ConflictException('Patient with this email or phone already exists in this clinic');
        }

        // 2. Patient ID Generation (F-007)
        const count = await this.prisma.patient.count({ where: { organizationId } });
        const patientCode = createPatientDto.patientCode || `PAT-${(count + 1).toString().padStart(6, '0')}`;

        return this.prisma.$transaction(async (tx) => {
            const patient = await tx.patient.create({
                data: {
                    ...createPatientDto,
                    patientCode,
                    organizationId,
                    branchId,
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
                createdBy,
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

  async search(organizationId: string, query: string) {
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

   async findOne(id: string, organizationId: string, branchId: string) {
     const patient = await this.prisma.patient.findUnique({
       where: { id, organizationId, branchId },
       include: {
         addresses: true,
         emergencyContacts: true,
         familyMembers: true,
         tags: true,
         notes: true,
         appointments: { take: 5, orderBy: { scheduledStart: 'desc' } },
         consultations: { take: 5, orderBy: { consultationDate: 'desc' } },
       },
     });
     if (!patient) {
       throw new NotFoundException(`Patient with ID ${id} not found`);
     }
     return patient;
   }

  async update(id: string, updatePatientDto: UpdatePatientDto) {
    const patient = await this.prisma.patient.update({
      where: { id },
      data: updatePatientDto as Prisma.PatientUpdateInput,
    });

    await this.timeline.record({
      organizationId: patient.organizationId,
      patientId: patient.id,
      eventType: 'PATIENT_UPDATED',
      eventCategory: 'PATIENT',
      title: 'Profile Updated',
      description: 'Patient personal information was updated.',
      createdBy: (updatePatientDto as any).updatedBy,
    });

    return patient;
  }

  async remove(id: string) {
    // Soft delete
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

    return patient;
  }

  async addNote(patientId: string, noteData: any) {
    return this.prisma.patientNote.create({
      data: {
        ...noteData,
        patientId,
        organizationId: noteData.organizationId || 'default-org-id',
        branchId: noteData.branchId || 'default-branch-id',
        createdBy: noteData.createdBy || 'default-user-id',
      },
    });
  }
}
