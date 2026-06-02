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
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let AnalyticsService = class AnalyticsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getDoctorDashboard(doctorId, organizationId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [totalAppointments, todayAppointments, totalPatients, totalRevenue] = await Promise.all([
            this.prisma.appointment.count({ where: { doctorId } }),
            this.prisma.appointment.count({ where: { doctorId, scheduledStart: { gte: today } } }),
            this.prisma.patient.count({ where: { organizationId } }),
            this.prisma.payment.aggregate({
                where: { organizationId, paymentStatus: 'PAID' },
                _sum: { amount: true }
            }),
        ]);
        const last7Days = Array.from({ length: 7 }).map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            return d;
        }).reverse();
        const chartData = await Promise.all(last7Days.map(async (date) => {
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            const count = await this.prisma.appointment.count({
                where: { doctorId, scheduledStart: { gte: date, lt: nextDay } }
            });
            return {
                date: date.toLocaleDateString('en-US', { weekday: 'short' }),
                appointments: count,
            };
        }));
        return {
            stats: {
                totalAppointments,
                todayAppointments,
                totalPatients,
                totalRevenue: totalRevenue?._sum?.amount || 0,
            },
            chartData
        };
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map