import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDoctorDashboard(doctorId: string, organizationId: string) {
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

    // Get appointment stats for chart
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
}
