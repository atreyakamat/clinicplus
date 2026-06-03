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
exports.FollowUpsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let FollowUpsService = class FollowUpsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        return this.prisma.followUp.create({
            data: {
                ...data,
                organizationId: data.organizationId,
                branchId: data.branchId,
            }
        });
    }
    async findAll(organizationId, branchId) {
        return this.prisma.followUp.findMany({
            where: { organizationId, branchId },
            include: {
                patient: { select: { firstName: true, lastName: true, phone: true } },
                doctor: { select: { firstName: true, lastName: true } },
                outcomes: true
            },
            orderBy: { scheduledDate: 'asc' }
        });
    }
    async addOutcome(followUpId, data, organizationId) {
        const followUp = await this.prisma.followUp.findUnique({
            where: { id: followUpId, organizationId }
        });
        if (!followUp)
            throw new common_1.NotFoundException('Follow-up not found');
        return this.prisma.followUpOutcome.create({
            data: {
                ...data,
                followUpId,
                organizationId,
                branchId: followUp.branchId,
            }
        });
    }
    async updateStatus(id, status, organizationId) {
        const followUp = await this.prisma.followUp.findUnique({
            where: { id, organizationId }
        });
        if (!followUp)
            throw new common_1.NotFoundException('Follow-up not found');
        return this.prisma.followUp.update({
            where: { id },
            data: { status }
        });
    }
};
exports.FollowUpsService = FollowUpsService;
exports.FollowUpsService = FollowUpsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FollowUpsService);
//# sourceMappingURL=follow-ups.service.js.map