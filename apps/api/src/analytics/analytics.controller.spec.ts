import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  const mockRequest = {
    user: {
      id: 'doc-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            getDoctorDashboard: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getDoctorDashboard', () => {
    it('should call service with injected user context', async () => {
      jest
        .spyOn(service, 'getDoctorDashboard')
        .mockResolvedValue({ stats: {}, chartData: [] } as any);

      const result = await controller.getDoctorDashboard(mockRequest);
      expect(result).toBeDefined();
      expect(service.getDoctorDashboard).toHaveBeenCalledWith(
        'doc-1',
        'org-1',
        'branch-1',
      );
    });
  });
});
