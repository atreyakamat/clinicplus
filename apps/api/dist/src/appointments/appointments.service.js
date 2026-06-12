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
const audit_service_1 = require("../common/services/audit.service");
let AppointmentsService = class AppointmentsService {
    prisma;
    auditService;
    constructor(prisma, auditService) {
        this.prisma = prisma;
        this.auditService = auditService;
    }
    async create(data, organizationId, branchId, createdBy) {
        if (new Date(data.scheduledStart) < new Date()) {
            throw new common_1.BadRequestException('Cannot book an appointment in the past');
        }
        const overlapping = await this.prisma.appointment.findFirst({
            where: {
                doctorId: data.doctorId,
                organizationId,
                branchId,
                status: { notIn: ['CANCELLED', 'NO_SHOW'] },
                scheduledStart: { lt: data.scheduledEnd },
                scheduledEnd: { gt: data.scheduledStart },
            },
        });
        if (overlapping) {
            throw new common_1.BadRequestException('Doctor is already booked for this time slot');
        }
        const appointment = await this.prisma.appointment.create({
            data: {
                ...data,
                organizationId,
                branchId,
                createdBy,
            },
        });
        await this.auditService.log({
            organizationId: appointment.organizationId,
            userId: createdBy,
            action: 'CREATE',
            resource: 'appointment',
            resourceId: appointment.id,
            afterData: {
                id: appointment.id,
                patientId: appointment.patientId,
                doctorId: appointment.doctorId,
                scheduledStart: appointment.scheduledStart,
                scheduledEnd: appointment.scheduledEnd,
                status: appointment.status,
                organizationId: appointment.organizationId,
                branchId: appointment.branchId,
            },
        });
        return appointment;
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
                    select: { id: true, firstName: true, lastName: true, phone: true },
                },
                doctor: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
            orderBy: {
                scheduledStart: 'asc',
            },
        });
    }
    async findOne(id, organizationId, branchId) {
        const appointment = await this.prisma.appointment.findFirst({ where: { id, organizationId, branchId },
            include: {
                patient: true,
                doctor: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });
        if (!appointment)
            throw new common_1.NotFoundException('Appointment not found');
        return appointment;
    }
    async update(id, data, organizationId, branchId, updatedBy) {
        const oldAppointment = await this.prisma.appointment.findFirst({ where: { id, organizationId, branchId },
            include: {
                patient: {
                    select: { id: true, firstName: true, lastName: true },
                },
                doctor: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });
        if (!oldAppointment) {
            throw new common_1.NotFoundException('Appointment not found');
        }
        const appointment = await this.prisma.appointment.update({
            where: { id },
            data,
        });
        await this.auditService.log({
            organizationId: appointment.organizationId,
            userId: updatedBy,
            action: 'UPDATE',
            resource: 'appointment',
            resourceId: appointment.id,
            beforeData: oldAppointment,
            afterData: appointment,
        });
        return appointment;
    }
    async remove(id, organizationId, branchId, removedBy) {
        const oldAppointment = await this.prisma.appointment.findFirst({ where: { id, organizationId, branchId },
            include: {
                patient: {
                    select: { id: true, firstName: true, lastName: true },
                },
                doctor: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });
        if (!oldAppointment) {
            throw new common_1.NotFoundException('Appointment not found');
        }
        const appointment = await this.prisma.appointment.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });
        await this.auditService.log({
            organizationId: appointment.organizationId,
            userId: removedBy,
            action: 'DELETE',
            resource: 'appointment',
            resourceId: appointment.id,
            beforeData: oldAppointment,
            afterData: {
                id: appointment.id,
                status: appointment.status,
            },
        });
        return appointment;
    }
};
exports.AppointmentsService = AppointmentsService;
exports.AppointmentsService = AppointmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], AppointmentsService);
//# sourceMappingURL=appointments.service.js.map