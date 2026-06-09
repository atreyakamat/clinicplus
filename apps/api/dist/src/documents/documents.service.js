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
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let DocumentsService = class DocumentsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data, organizationId, branchId, uploadedBy) {
        return this.prisma.medicalDocument.create({
            data: {
                ...data,
                organizationId,
                branchId,
                uploadedBy,
            },
        });
    }
    async findAll(organizationId, branchId) {
        return this.prisma.medicalDocument.findMany({
            where: {
                organizationId,
                branchId,
            },
            include: {
                patient: {
                    select: { id: true, firstName: true, lastName: true },
                },
                uploader: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    async findOne(id, organizationId, branchId) {
        const document = await this.prisma.medicalDocument.findUnique({
            where: { id, organizationId, branchId },
            include: {
                patient: {
                    select: { id: true, firstName: true, lastName: true },
                },
                uploader: {
                    select: { id: true, firstName: true, lastName: true },
                },
                labReports: true,
                imagingReports: true,
            },
        });
        if (!document) {
            throw new common_1.NotFoundException(`Document with ID ${id} not found`);
        }
        return document;
    }
    async update(id, data, organizationId, branchId) {
        await this.findOne(id, organizationId, branchId);
        return this.prisma.medicalDocument.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
        });
    }
    async remove(id, organizationId, branchId) {
        await this.findOne(id, organizationId, branchId);
        return this.prisma.medicalDocument.delete({
            where: { id },
        });
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DocumentsService);
//# sourceMappingURL=documents.service.js.map