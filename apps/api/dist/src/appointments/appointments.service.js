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
exports.AppointmentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let AppointmentsService = class AppointmentsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data, organizationId, branchId, createdBy) {
        const overlapping = await this.prisma.appointment.findFirst({
            where: {
                doctorId: data.doctorId,
                organizationId,
                branchId,
                status: { notIn: ['CANCELLED', 'NO_SHOW'] },
                OR: [
                    {
                        scheduledStart: { lte: data.scheduledStart },
                        scheduledEnd: { gt: data.scheduledStart },
                    },
                    {
                        scheduledStart: { lt: data.scheduledEnd },
                        scheduledEnd: { gte: data.scheduledEnd },
                    },
                ]
            },
        });
        if (overlapping) {
            throw new common_1.BadRequestException('Doctor is already booked for this time slot');
        }
        return this.prisma.appointment.create({
            data: {
                ...data,
                organizationId,
                branchId,
                createdBy,
            },
        });
    }
    async findAll(organizationId, branchId, date) {
        const where = {
            organizationId,
            branchId,
            status: { not: 'CANCELLED' },
        };
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            where.scheduledStart = {
                gte: startOfDay,
                lte: endOfDay,
            };
        }
        return this.prisma.appointment.findMany({
            where,
            include: {
                patient: {
                    select: { id: true, firstName: true, lastName: true, phone: true }
                },
                doctor: {
                    select: { id: true, firstName: true, lastName: true }
                }
            },
            orderBy: {
                scheduledStart: 'asc',
            },
        });
    }
    async findOne(id, organizationId, branchId) {
        const appointment = await this.prisma.appointment.findUnique({
            where: { id, organizationId, branchId },
            include: {
                patient: true,
                doctor: {
                    select: { id: true, firstName: true, lastName: true }
                }
            },
        });
        if (!appointment)
            throw new common_1.NotFoundException('Appointment not found');
        return appointment;
    }
    async update(id, data) {
        return this.prisma.appointment.update({
            where: { id },
            data,
        });
    }
    async remove(id) {
        return this.prisma.appointment.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });
    }
};
exports.AppointmentsService = AppointmentsService;
exports.AppointmentsService = AppointmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AppointmentsService);
//# sourceMappingURL=appointments.service.js.map