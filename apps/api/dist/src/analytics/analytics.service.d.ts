import { PrismaService } from '../prisma/prisma.service';
export declare class AnalyticsService {
    private prisma;
    constructor(prisma: PrismaService);
    getDoctorDashboard(doctorId: string, organizationId: string): Promise<{
        stats: {
            totalAppointments: number;
            todayAppointments: number;
            totalPatients: number;
            totalRevenue: number | import("@prisma/client/runtime/library").Decimal;
        };
        chartData: {
            date: string;
            appointments: number;
        }[];
    }>;
}
