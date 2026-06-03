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
const timeline_service_1 = require("../timeline/timeline.service");
let PatientsService = class PatientsService {
    prisma;
    timeline;
    constructor(prisma, timeline) {
        this.prisma = prisma;
        this.timeline = timeline;
    }
    async create(createPatientDto, organizationId, branchId, createdBy) {
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
            throw new common_1.ConflictException('Patient with this email or phone already exists in this clinic');
        }
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
    async search(organizationId, query) {
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
    async findOne(id, organizationId, branchId) {
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
            throw new common_1.NotFoundException(`Patient with ID ${id} not found`);
        }
        return patient;
    }
    async update(id, updatePatientDto) {
        const patient = await this.prisma.patient.update({
            where: { id },
            data: updatePatientDto,
        });
        await this.timeline.record({
            organizationId: patient.organizationId,
            patientId: patient.id,
            eventType: 'PATIENT_UPDATED',
            eventCategory: 'PATIENT',
            title: 'Profile Updated',
            description: 'Patient personal information was updated.',
            createdBy: updatePatientDto.updatedBy,
        });
        return patient;
    }
    async remove(id) {
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        timeline_service_1.TimelineService])
], PatientsService);
//# sourceMappingURL=patients.service.js.map