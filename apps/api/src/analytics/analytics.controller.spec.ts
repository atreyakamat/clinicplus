import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  const service = { doctor: jest.fn(), overview: jest.fn() };
  const req = { user: { id: 'doc-1', organizationId: 'org-1', branchId: 'branch-1', permissions: [] } };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: service }],
    }).compile();
    controller = module.get(AnalyticsController);
  });

  it('doctor/me always uses the caller id (never a client-supplied doctor)', async () => {
    service.doctor.mockResolvedValue({});
    await controller.myDoctorAnalytics({ from: '2026-01-01' } as any, req);
    expect(service.doctor).toHaveBeenCalledWith(req.user, 'doc-1', { from: '2026-01-01' }, true);
  });

  it('doctors/:id marks self only when the id is the caller', async () => {
    service.doctor.mockResolvedValue({});
    await controller.doctorAnalytics('doc-2', {} as any, req);
    expect(service.doctor).toHaveBeenCalledWith(req.user, 'doc-2', {}, false);
  });
});
