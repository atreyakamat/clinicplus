import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockUserId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: PrismaService,
          useValue: {
            medicalDocument: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    it('should create a medical document', async () => {
      const data = { title: 'Lab Report', fileUrl: 'http://test.com/file.pdf' } as any;
      jest.spyOn(prisma.medicalDocument, 'create').mockResolvedValue({ id: 'doc-1', ...data } as any);

      const result = await service.create(data, mockOrgId, mockBranchId, mockUserId);
      expect(result.id).toBe('doc-1');
      expect(prisma.medicalDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ uploadedBy: mockUserId, organizationId: mockOrgId })
      });
    });
  });

  describe('findOne', () => {
    it('should return document if exists', async () => {
      jest.spyOn(prisma.medicalDocument, 'findUnique').mockResolvedValue({ id: 'doc-1' } as any);
      const result = await service.findOne('doc-1', mockOrgId, mockBranchId);
      expect(result.id).toBe('doc-1');
    });

    it('should throw NotFoundException if missing', async () => {
      jest.spyOn(prisma.medicalDocument, 'findUnique').mockResolvedValue(null);
      await expect(service.findOne('doc-1', mockOrgId, mockBranchId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update document after verification', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'doc-1' } as any);
      jest.spyOn(prisma.medicalDocument, 'update').mockResolvedValue({ id: 'doc-1', title: 'New Title' } as any);

      const result = await service.update('doc-1', { title: 'New Title' }, mockOrgId, mockBranchId);
      expect(result.title).toBe('New Title');
    });
  });

  describe('remove', () => {
    it('should delete document after verification', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'doc-1' } as any);
      jest.spyOn(prisma.medicalDocument, 'delete').mockResolvedValue({ id: 'doc-1' } as any);

      const result = await service.remove('doc-1', mockOrgId, mockBranchId);
      expect(result.id).toBe('doc-1');
      expect(prisma.medicalDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });
  });
});
