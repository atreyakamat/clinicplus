import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { MalwareScannerService } from '../security/malware-scanner.service';

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let service: DocumentsService;

  const mockRequest = {
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        {
          provide: DocumentsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: MalwareScannerService,
          useValue: {
            scanAndValidate: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    controller = module.get<DocumentsController>(DocumentsController);
    service = module.get<DocumentsService>(DocumentsService);
  });

  describe('create', () => {
    it('should call service create with context', async () => {
      const data = { title: 'Report' };
      jest.spyOn(service, 'create').mockResolvedValue({ id: 'doc-1' } as any);
      await controller.create(data, mockRequest);
      expect(service.create).toHaveBeenCalledWith(
        data,
        'org-1',
        'branch-1',
        'user-1',
      );
    });
  });

  describe('findAll', () => {
    it('should call service findAll with context', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue([]);
      await controller.findAll(mockRequest);
      expect(service.findAll).toHaveBeenCalledWith('org-1', 'branch-1');
    });
  });

  describe('findOne', () => {
    it('should call service findOne with context', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'doc-1' } as any);
      await controller.findOne('doc-1', mockRequest);
      expect(service.findOne).toHaveBeenCalledWith(
        'doc-1',
        'org-1',
        'branch-1',
      );
    });
  });

  describe('update', () => {
    it('should call service update with context', async () => {
      jest.spyOn(service, 'update').mockResolvedValue({ id: 'doc-1' } as any);
      await controller.update('doc-1', { title: 'Updated' }, mockRequest);
      expect(service.update).toHaveBeenCalledWith(
        'doc-1',
        { title: 'Updated' },
        'org-1',
        'branch-1',
      );
    });
  });

  describe('remove', () => {
    it('should call service remove with context', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue({ id: 'doc-1' } as any);
      await controller.remove('doc-1', mockRequest);
      expect(service.remove).toHaveBeenCalledWith('doc-1', 'org-1', 'branch-1');
    });
  });
});
