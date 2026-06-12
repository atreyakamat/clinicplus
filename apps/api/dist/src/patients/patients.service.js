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
const audit_service_1 = require("../common/services/audit.service");
let PatientsService = class PatientsService {
    prisma;
    timeline;
    auditService;
    constructor(prisma, timeline, auditService) {
        this.prisma = prisma;
        this.timeline = timeline;
        this.auditService = auditService;
    }
    validateUuid(id) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            throw new common_1.NotFoundException(`Invalid ID format: ${id}`);
        }
    }
    async create(data) {
        const organizationId = data.organizationId;
        const duplicateCriteria = [];
        if (data.email)
            duplicateCriteria.push({ email: data.email });
        if (data.phone)
            duplicateCriteria.push({ phone: data.phone });
        if (data.firstName && data.lastName && data.phone) {
            duplicateCriteria.push({
                AND: [
                    { firstName: data.firstName },
                    { lastName: data.lastName },
                    { phone: data.phone }
                ]
            });
        }
        if (duplicateCriteria.length > 0) {
            const existing = await this.prisma.patient.findFirst({
                where: {
                    organizationId,
                    status: 'ACTIVE',
                    OR: duplicateCriteria,
                },
            });
            if (existing) {
                const field = existing.email === data.email ? 'email' : (existing.phone === data.phone ? 'phone' : 'name/phone combination');
                throw new common_1.ConflictException(`Patient with this ${field} already exists in this clinic`);
            }
        }
        const count = await this.prisma.patient.count({
            where: { organizationId },
        });
        const patientCode = data.patientCode || `PAT-${(count + 1).toString().padStart(6, '0')}`;
        return this.prisma.$transaction(async (tx) => {
            const patient = await tx.patient.create({
                data: {
                    ...data,
                    patientCode,
                },
            });
            await this.timeline.record({
                organizationId: patient.organizationId,
                patientId: patient.id,
                eventType: 'PATIENT_REGISTERED',
                eventCategory: 'PATIENT',
                title: 'Patient Registered',
                description: `Patient ${patient.firstName} ${patient.lastName} was registered in the system.`,
                createdBy: data.createdBy,
            }, tx);
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
    async findOne(id, organizationId, branchId) {
        this.validateUuid(id);
        const patient = await this.prisma.patient.findFirst({ where: { id, organizationId, branchId },
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
            throw new common_1.NotFoundException(`Patient with ID ${id} not found`);
        }
        return patient;
    }
    async update(id, data, organizationId, branchId) {
        this.validateUuid(id);
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
    async remove(id, organizationId, branchId, removedBy) {
        this.validateUuid(id);
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
    async search(organizationId, query) {
        if (!query || query.length < 2)
            return [];
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
    async addNote(patientId, noteData) {
        this.validateUuid(patientId);
        return this.prisma.patientNote.create({
            data: {
                ...noteData,
                patientId,
            },
        });
    }
};
exports.PatientsService = PatientsService;
exports.PatientsService = PatientsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        timeline_service_1.TimelineService,
        audit_service_1.AuditService])
], PatientsService);
//# sourceMappingURL=patients.service.js.map