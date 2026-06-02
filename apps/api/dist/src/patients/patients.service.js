"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatientsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let PatientsService = class PatientsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(createPatientDto) {
        return this.prisma.patient.create({
            data: {
                ...createPatientDto,
                organizationId: createPatientDto.organizationId || 'default-org-id',
                branchId: createPatientDto.branchId || 'default-branch-id',
            },
        });
    }
    async findAll(organizationId, branchId) {
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
    async findOne(id) {
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
            throw new common_1.NotFoundException(`Patient with ID ${id} not found`);
        }
        return patient;
    }
    async update(id, updatePatientDto) {
        const patient = await this.prisma.patient.findUnique({
            where: { id },
        });
        if (!patient) {
            throw new common_1.NotFoundException(`Patient with ID ${id} not found`);
        }
        return this.prisma.patient.update({
            where: { id },
            data: updatePatientDto,
        });
    }
    async remove(id) {
        return this.prisma.patient.update({
            where: { id },
            data: {
                status: 'INACTIVE',
                deletedAt: new Date(),
            },
        });
    }
    async addAddress(patientId, addressData) {
        return this.prisma.patientAddress.create({
            data: {
                ...addressData,
                patientId,
                organizationId: addressData.organizationId || 'default-org-id',
                branchId: addressData.branchId || 'default-branch-id',
            },
        });
    }
    async addEmergencyContact(patientId, emergencyContactData) {
        return this.prisma.patientEmergencyContact.create({
            data: {
                ...emergencyContactData,
                patientId,
                organizationId: emergencyContactData.organizationId || 'default-org-id',
                branchId: emergencyContactData.branchId || 'default-branch-id',
            },
        });
    }
    async addTag(patientId, tagData) {
        return this.prisma.patientTag.create({
            data: {
                ...tagData,
                patientId,
                organizationId: tagData.organizationId || 'default-org-id',
                branchId: tagData.branchId || 'default-branch-id',
            },
        });
    }
    async addNote(patientId, noteData) {
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
};
exports.PatientsService = PatientsService;
exports.PatientsService = PatientsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PatientsService);
//# sourceMappingURL=patients.service.js.map