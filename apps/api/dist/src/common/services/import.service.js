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
exports.ImportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ImportService = class ImportService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async validateAndPreview(entity, data) {
        const preview = data.slice(0, 10);
        const errors = [];
        data.forEach((row, index) => {
            if (entity === 'patient') {
                if (!row.firstName || !row.lastName) {
                    errors.push({ row: index + 1, message: 'First name and Last name are required' });
                }
            }
        });
        return {
            total: data.length,
            preview,
            errors: errors.length > 0 ? errors.slice(0, 20) : null,
            errorCount: errors.length
        };
    }
    async processImport(entity, data, context) {
        return this.prisma.$transaction(async (tx) => {
            let importedCount = 0;
            for (const row of data) {
                if (entity === 'patient') {
                    const existing = await tx.patient.findFirst({
                        where: {
                            organizationId: context.organizationId,
                            OR: [
                                { email: row.email || 'none' },
                                { phone: row.phone || 'none' }
                            ]
                        }
                    });
                    if (!existing) {
                        await tx.patient.create({
                            data: {
                                ...row,
                                organizationId: context.organizationId,
                                branchId: context.branchId,
                                createdBy: context.userId
                            }
                        });
                        importedCount++;
                    }
                }
            }
            return { importedCount };
        });
    }
};
exports.ImportService = ImportService;
exports.ImportService = ImportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ImportService);
//# sourceMappingURL=import.service.js.map