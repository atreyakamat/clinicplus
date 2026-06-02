import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async create(createPatientDto: CreatePatientDto) {
    return this.prisma.patient.create({
      data: {
        ...createPatientDto,
        organizationId: (createPatientDto as any).organizationId || 'default-org-id', // In real app, get from context
        branchId: (createPatientDto as any).branchId || 'default-branch-id', // In real app, get from context
      },
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

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        addresses: true,
        emergencyContacts: true,
        familyMembers: true,
        tags: true,
        notes: true,
      },
    });
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }
    return patient;
  }

  async update(id: string, updatePatientDto: UpdatePatientDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
    });
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }
    return this.prisma.patient.update({
      where: { id },
      data: updatePatientDto,
    });
  }

  async remove(id: string) {
    // Soft delete
    return this.prisma.patient.update({
      where: { id },
      data: {
        status: 'INACTIVE',
        deletedAt: new Date(),
      },
    });
  }

  async addAddress(patientId: string, addressData: any) {
    return this.prisma.patientAddress.create({
      data: {
        ...addressData,
        patientId,
        organizationId: addressData.organizationId || 'default-org-id',
        branchId: addressData.branchId || 'default-branch-id',
      },
    });
  }

  async addEmergencyContact(patientId: string, emergencyContactData: any) {
    return this.prisma.patientEmergencyContact.create({
      data: {
        ...emergencyContactData,
        patientId,
        organizationId: emergencyContactData.organizationId || 'default-org-id',
        branchId: emergencyContactData.branchId || 'default-branch-id',
      },
    });
  }

  async addTag(patientId: string, tagData: any) {
    return this.prisma.patientTag.create({
      data: {
        ...tagData,
        patientId,
        organizationId: tagData.organizationId || 'default-org-id',
        branchId: tagData.branchId || 'default-branch-id',
      },
    });
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
