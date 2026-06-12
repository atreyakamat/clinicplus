import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { PdfService } from '../common/services/pdf.service';
import { OrganizationsService } from '../organizations/organizations.service';

describe('PrescriptionsController', () => {
  let controller: PrescriptionsController;
  let service: PrescriptionsService;
  let pdfService: PdfService;
  let orgService: OrganizationsService;

  const mockRequest = {
    user: {
      id: 'doc-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrescriptionsController],
      providers: [
        {
          provide: PrescriptionsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: PdfService,
          useValue: {
            generatePrescriptionPdf: jest.fn(),
          },
        },
        {
          provide: OrganizationsService,
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PrescriptionsController>(PrescriptionsController);
    service = module.get<PrescriptionsService>(PrescriptionsService);
    pdfService = module.get<PdfService>(PdfService);
    orgService = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('create', () => {
    it('should inject context and call service create', async () => {
      jest.spyOn(service, 'create').mockResolvedValue({ id: 'rx-1' } as any);
      await controller.create({ items: [] }, mockRequest);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', doctorId: 'doc-1' }),
      );
    });
  });

  describe('findAll', () => {
    it('should pass query params to service', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue([]);
      await controller.findAll('pat-1', mockRequest);
      expect(service.findAll).toHaveBeenCalledWith(
        'org-1',
        'branch-1',
        'pat-1',
      );
    });
  });

  describe('findOne', () => {
    it('should call service findOne', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'rx-1' } as any);
      await controller.findOne('rx-1', mockRequest);
      expect(service.findOne).toHaveBeenCalledWith('rx-1', 'org-1', 'branch-1');
    });
  });

  describe('download', () => {
    it('should fetch rx and org, generate PDF, and pipe to response', async () => {
      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      };

      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'rx-1' } as any);
      jest
        .spyOn(orgService, 'findOne')
        .mockResolvedValue({ id: 'org-1' } as any);
      jest
        .spyOn(pdfService, 'generatePrescriptionPdf')
        .mockResolvedValue(Buffer.from('pdf-content'));

      await controller.download('rx-1', mockRequest, mockRes);

      expect(service.findOne).toHaveBeenCalledWith('rx-1', 'org-1', 'branch-1');
      expect(orgService.findOne).toHaveBeenCalledWith('org-1');
      expect(pdfService.generatePrescriptionPdf).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
        }),
      );
      expect(mockRes.end).toHaveBeenCalled();
    });
  });
});
