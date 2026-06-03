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
exports.ConsultationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ConsultationsService = class ConsultationsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        return this.prisma.consultation.create({
            data,
        });
    }
    async findAllByPatient(patientId, organizationId) {
        return this.prisma.consultation.findMany({
            where: { patientId, organizationId },
            include: {
                diagnoses: true,
                vitals: true,
                doctor: { select: { firstName: true, lastName: true } },
            },
            orderBy: { consultationDate: 'desc' },
        });
    }
    async findOne(id, organizationId, branchId) {
        const consultation = await this.prisma.consultation.findUnique({
            where: { id, organizationId, branchId },
            include: {
                patient: true,
                diagnoses: true,
                vitals: true,
                prescriptions: { include: { items: true } },
                followUps: true,
                doctor: { select: { firstName: true, lastName: true } },
            },
        });
        if (!consultation)
            throw new common_1.NotFoundException('Consultation not found');
        return consultation;
    }
    async update(id, data, organizationId, branchId) {
        const { diagnoses, vitals, ...consultationData } = data;
        return this.prisma.$transaction(async (tx) => {
            await this.findOne(id, organizationId, branchId);
            const updated = await tx.consultation.update({
                where: { id },
                data: consultationData,
            });
            if (vitals) {
                await tx.vital.upsert({
                    where: { id: vitals.id || 'none' },
                    update: vitals,
                    create: { ...vitals, consultationId: id, organizationId: updated.organizationId, branchId: updated.branchId },
                });
            }
            if (diagnoses && Array.isArray(diagnoses)) {
                await tx.diagnosis.deleteMany({ where: { consultationId: id } });
                await tx.diagnosis.createMany({
                    data: diagnoses.map(d => ({ ...d, consultationId: id, organizationId: updated.organizationId, branchId: updated.branchId })),
                });
            }
            return updated;
        });
    }
    async complete(id, organizationId, branchId) {
        await this.findOne(id, organizationId, branchId);
        return this.prisma.consultation.update({
            where: { id },
            data: { status: 'COMPLETED' },
        });
    }
};
exports.ConsultationsService = ConsultationsService;
exports.ConsultationsService = ConsultationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ConsultationsService);
//# sourceMappingURL=consultations.service.js.map