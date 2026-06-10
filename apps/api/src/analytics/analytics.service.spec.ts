import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockDoctorId = 'doc-1';

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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDoctorDashboard', () => {
    it('should return aggregated stats and chart data', async () => {
      // Mock parallel queries
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(5);
      jest.spyOn(prisma.payment, 'aggregate').mockResolvedValue({ _sum: { amount: 500 } } as any);

      const result = await service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId);

      // Verify stats
      expect(result.stats.totalAppointments).toBe(10);
      expect(result.stats.totalPatients).toBe(5);
      expect(result.stats.totalRevenue).toBe(500);

      // Verify chart data length (7 days)
      expect(result.chartData.length).toBe(7);
      
      // Verify appointment count was called correctly
      expect(prisma.appointment.count).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ doctorId: mockDoctorId })
      }));
    });

    it('should handle zero revenue safely', async () => {
      jest.spyOn(prisma.appointment, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.patient, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.payment, 'aggregate').mockResolvedValue({ _sum: { amount: null } } as any);

      const result = await service.getDoctorDashboard(mockDoctorId, mockOrgId, mockBranchId);
      expect(result.stats.totalRevenue).toBe(0);
    });
  });
});
