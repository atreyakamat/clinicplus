import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockDoctorId = 'doc-1';
  const mockOrgId2 = 'org-2';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: {
            appointment: {
              count: jest.fn(),
            },
            patient: {
              count: jest.fn(),
            },
            payment: {
              aggregate: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('HAPPY PATH: Dashboard Analytics', () => {
    it('should return aggregated stats and chart data for doctor', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 500 } } as any);

      const result = await service.getDoctorDashboard(
        mockDoctorId,
        mockOrgId,
        mockBranchId,
      );

      expect(result.stats.totalAppointments).toBe(10);
      expect(result.stats.totalPatients).toBe(5);
      expect(result.stats.totalRevenue).toBe(500);
      expect(result.chartData.length).toBe(7);
    });

    it('should calculate today appointments correctly', async () => {
      jest
        .spyOn(prisma.appointment, 'count')
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3) // today
        .mockResolvedValueOnce(5) // patient count
        .mockResolvedValue(1); // chart data

      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 500 } } as any);

      const result = await service.getDoctorDashboard(
        mockDoctorId,
        mockOrgId,
        mockBranchId,
      );

      expect(result.stats.todayAppointments).toBe(3);
    });

    it('should generate 7-day chart data', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(2);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 500 } } as any);

      const result = await service.getDoctorDashboard(
        mockDoctorId,
        mockOrgId,
        mockBranchId,
      );

      expect(result.chartData.length).toBe(7);
      result.chartData.forEach((day: any) => {
        expect(day.date).toBeDefined();
        expect(day.appointments).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('VALIDATION: Analytics Queries', () => {
    it('should query total appointments with doctor context', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 0 } } as any);

      await service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId);

      expect(prisma.appointment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctorId: mockDoctorId,
            organizationId: mockOrgId,
            branchId: mockBranchId,
          }),
        }),
      );
    });

    it('should query today appointments with date filter', async () => {
      jest
        .spyOn(prisma.appointment, 'count')
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3)
        .mockResolvedValue(1);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 0 } } as any);

      await service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId);

      const calls = (prisma.appointment.count as jest.Mock).mock.calls;
      const todayCall = calls[1];
      expect(todayCall[0].where.scheduledStart).toBeDefined();
      expect(todayCall[0].where.scheduledStart.gte).toBeDefined();
    });

    it('should aggregate only PAID payments', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 500 } } as any);

      await service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId);

      expect(prisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentStatus: 'PAID',
          }),
        }),
      );
    });
  });

  describe('EDGE CASES: Analytics Scenarios', () => {
    it('should handle zero revenue safely', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(0);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: null } } as any);

      const result = await service.getDoctorDashboard(
        mockDoctorId,
        mockOrgId,
        mockBranchId,
      );

      expect(result.stats.totalRevenue).toBe(0);
    });

    it('should handle zero appointments', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(10);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 0 } } as any);

      const result = await service.getDoctorDashboard(
        mockDoctorId,
        mockOrgId,
        mockBranchId,
      );

      expect(result.stats.totalAppointments).toBe(0);
      expect(result.stats.totalPatients).toBe(10);
    });

    it('should handle missing _sum in aggregate result', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(5);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(3);
      jest.spyOn(prisma.payment, 'aggregate').mockResolvedValue({} as any);

      const result = await service.getDoctorDashboard(
        mockDoctorId,
        mockOrgId,
        mockBranchId,
      );

      expect(result.stats.totalRevenue).toBe(0);
    });

    it('should format dates correctly in chart data', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(1);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 0 } } as any);

      const result = await service.getDoctorDashboard(
        mockDoctorId,
        mockOrgId,
        mockBranchId,
      );

      result.chartData.forEach((day: any) => {
        expect(typeof day.date).toBe('string');
        expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).toContain(
          day.date,
        );
      });
    });
  });

  describe('MULTI-TENANT: Analytics Isolation', () => {
    it('should query only appointments for specified organization', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 0 } } as any);

      await service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId);

      expect(prisma.appointment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrgId,
            branchId: mockBranchId,
          }),
        }),
      );
    });

    it('should enforce branch isolation in patient count', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 0 } } as any);

      await service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId);

      expect(prisma.patient.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrgId,
            branchId: mockBranchId,
          }),
        }),
      );
    });

    it('should aggregate payments for specified organization only', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 1000 } } as any);

      await service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId);

      expect(prisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrgId,
            branchId: mockBranchId,
          }),
        }),
      );
    });

    it('should use doctor context for doctor dashboard', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 0 } } as any);

      const testDoctorId = 'doc-special-123';
      await service.getDoctorDashboard(testDoctorId, mockOrgId, mockBranchId);

      expect(prisma.appointment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctorId: testDoctorId,
          }),
        }),
      );
    });
  });

  describe('TRANSACTION ROLLBACK: Error Handling', () => {
    it('should handle appointment count error gracefully', async () => {
      jest
        .spyOn(prisma.appointment, 'count')
        .mockRejectedValue(new Error('Database error'));

      await expect(
        service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId),
      ).rejects.toThrow('Database error');
    });

    it('should handle patient count error', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest
        .spyOn(prisma.patient, 'count')
        .mockRejectedValue(new Error('Query failed'));

      await expect(
        service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId),
      ).rejects.toThrow('Query failed');
    });

    it('should handle payment aggregate error', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockRejectedValue(new Error('Aggregate failed'));

      await expect(
        service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId),
      ).rejects.toThrow('Aggregate failed');
    });
  });

  describe('RBAC: Analytics Context', () => {
    it('should include doctor-specific metrics', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 500 } } as any);

      const testDoctorId = 'doc-metrics-789';
      const result = await service.getDoctorDashboard(
        testDoctorId,
        mockOrgId,
        mockBranchId,
      );

      expect(result.stats).toBeDefined();
      expect(result.stats.totalAppointments).toBe(10);
      expect(result.stats.totalPatients).toBe(5);
    });

    it('should provide revenue metrics for organization', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 5000 } } as any);

      const result = await service.getDoctorDashboard(
        mockDoctorId,
        mockOrgId,
        mockBranchId,
      );

      expect(result.stats.totalRevenue).toBe(5000);
    });

    it('should maintain doctor isolation in analytics', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 0 } } as any);

      const doctor1Id = 'doc-1';
      const doctor2Id = 'doc-2';

      jest.clearAllMocks();
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest
        .spyOn(prisma.payment, 'aggregate')
        .mockResolvedValue({ _sum: { amount: 0 } } as any);

      await service.getDoctorDashboard(doctor1Id, mockOrgId, mockBranchId);

      expect(prisma.appointment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ doctorId: doctor1Id }),
        }),
      );
    });
  });
});
