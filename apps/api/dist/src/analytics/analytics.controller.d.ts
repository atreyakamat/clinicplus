import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    getDoctorDashboard(req: any): Promise<{
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
