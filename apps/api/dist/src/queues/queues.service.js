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
exports.QueuesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let QueuesService = class QueuesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getLiveQueue(organizationId, branchId) {
        const queue = await this.prisma.queue.findFirst({
            where: { organizationId, branchId },
            include: {
                entries: {
                    where: { status: { in: ['WAITING', 'CALLED', 'IN_PROGRESS'] } },
                    include: {
                        appointment: {
                            include: {
                                patient: true,
                                doctor: { select: { firstName: true, lastName: true } }
                            }
                        }
                    },
                    orderBy: { tokenNumber: 'asc' }
                }
            }
        });
        if (!queue) {
            return this.prisma.queue.create({
                data: {
                    name: 'Main Queue',
                    organizationId,
                    branchId,
                },
                include: { entries: true }
            });
        }
        return queue;
    }
    async checkIn(appointmentId, organizationId, branchId) {
        const queue = await this.getLiveQueue(organizationId, branchId);
        const lastEntry = await this.prisma.queueEntry.findFirst({
            where: { queueId: queue.id },
            orderBy: { tokenNumber: 'desc' }
        });
        const tokenNumber = (lastEntry?.tokenNumber || 0) + 1;
        return this.prisma.queueEntry.create({
            data: {
                queueId: queue.id,
                appointmentId,
                organizationId,
                branchId,
                tokenNumber,
                checkInTime: new Date(),
                status: 'WAITING'
            }
        });
    }
    async updateEntryStatus(entryId, status) {
        const data = { status };
        if (status === 'CALLED')
            data.calledTime = new Date();
        if (status === 'COMPLETED')
            data.completedTime = new Date();
        return this.prisma.queueEntry.update({
            where: { id: entryId },
            data
        });
    }
};
exports.QueuesService = QueuesService;
exports.QueuesService = QueuesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], QueuesService);
//# sourceMappingURL=queues.service.js.map