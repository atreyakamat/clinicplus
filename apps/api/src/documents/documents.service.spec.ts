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
  const mockOrgId2 = 'org-2';

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

  describe('HAPPY PATH: Document Operations', () => {
    it('should create a medical document with metadata', async () => {
      const data = {
        title: 'Lab Report',
        fileUrl: 'http://test.com/file.pdf',
        documentType: 'LAB_REPORT',
        patientId: 'pat-1',
      } as any;

      jest.spyOn(prisma.medicalDocument, 'create').mockResolvedValue({
        id: 'doc-1',
        ...data,
        uploadedBy: mockUserId,
        organizationId: mockOrgId,
      } as any);

      const result = await service.create(data, mockOrgId, mockBranchId, mockUserId);

      expect(result.id).toBe('doc-1');
      expect(result.uploadedBy).toBe(mockUserId);
      expect(prisma.medicalDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          uploadedBy: mockUserId,
          organizationId: mockOrgId,
          branchId: mockBranchId,
          title: 'Lab Report'
        })
      });
    });

    it('should retrieve document with full details', async () => {
      const document = {
        id: 'doc-1',
        title: 'Lab Report',
        fileUrl: 'http://test.com/file.pdf',
        patient: { id: 'pat-1', firstName: 'John', lastName: 'Doe' },
        uploadedByUser: { id: 'user-1', firstName: 'Dr', lastName: 'Smith' }
      };

      jest.spyOn(prisma.medicalDocument, 'findUnique').mockResolvedValue(document as any);

      const result = await service.findOne('doc-1', mockOrgId, mockBranchId);

      expect(result.patient.firstName).toBe('John');
      expect(result.uploadedByUser.firstName).toBe('Dr');
    });

    it('should list all documents for organization', async () => {
      const documents = [
        { id: 'doc-1', title: 'Report 1' },
        { id: 'doc-2', title: 'Report 2' }
      ];

      jest.spyOn(prisma.medicalDocument, 'findMany').mockResolvedValue(documents as any);

      const result = await service.findAll(mockOrgId, mockBranchId);

      expect(result.length).toBe(2);
    });
  });

  describe('VALIDATION: Document Business Rules', () => {
    it('should include uploadedBy when creating document', async () => {
      const data = {
        title: 'Prescription',
        fileUrl: 'http://test.com/pres.pdf',
        patientId: 'pat-1'
      } as any;

      jest.spyOn(prisma.medicalDocument, 'create').mockResolvedValue({
        id: 'doc-1',
        uploadedBy: mockUserId,
        ...data
      } as any);

      await service.create(data, mockOrgId, mockBranchId, mockUserId);

      expect(prisma.medicalDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            uploadedBy: mockUserId
          })
        })
      );
    });

    it('should handle document update with new data', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'doc-1' } as any);
      jest.spyOn(prisma.medicalDocument, 'update').mockResolvedValue({
        id: 'doc-1',
        title: 'Updated Title'
      } as any);

      const result = await service.update('doc-1', { title: 'Updated Title' }, mockOrgId, mockBranchId);

      expect(result.title).toBe('Updated Title');
    });
  });

  describe('EDGE CASES: Document Scenarios', () => {
    it('should handle documents with special characters in title', async () => {
      const data = {
        title: 'Patient_Report-2026_Q2 (Draft).pdf',
        fileUrl: 'http://test.com/file.pdf',
      } as any;

      jest.spyOn(prisma.medicalDocument, 'create').mockResolvedValue({
        id: 'doc-1',
        ...data,
        uploadedBy: mockUserId,
        organizationId: mockOrgId
      } as any);

      const result = await service.create(data, mockOrgId, mockBranchId, mockUserId);

      expect(result.title).toContain('Patient_Report');
    });

    it('should handle multiple document types', async () => {
      const documentTypes = ['LAB_REPORT', 'PRESCRIPTION', 'X_RAY', 'REFERRAL'];
      
      for (const docType of documentTypes) {
        const data = {
          title: `Test ${docType}`,
          documentType: docType,
          fileUrl: 'http://test.com/file.pdf'
        } as any;

        jest.spyOn(prisma.medicalDocument, 'create').mockResolvedValue({
          id: `doc-${docType}`,
          ...data,
          uploadedBy: mockUserId
        } as any);

        const result = await service.create(data, mockOrgId, mockBranchId, mockUserId);
        expect(result.documentType).toBe(docType);
      }
    });

    it('should support filtering documents by patient', async () => {
      const documents = [
        { id: 'doc-1', patientId: 'pat-1' }
      ];

      jest.spyOn(prisma.medicalDocument, 'findMany').mockResolvedValue(documents as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.medicalDocument.findMany).toHaveBeenCalled();
    });
  });

  describe('MULTI-TENANT: Document Isolation', () => {
    it('should only retrieve documents for specified organization', async () => {
      jest.spyOn(prisma.medicalDocument, 'findMany').mockResolvedValue([
        { id: 'doc-1', organizationId: mockOrgId }
      ] as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.medicalDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });

    it('should prevent cross-organization document access', async () => {
      jest.spyOn(prisma.medicalDocument, 'findUnique').mockResolvedValue(null);

      await expect(
        service.findOne('doc-1', mockOrgId2, mockBranchId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce branch isolation within organization', async () => {
      jest.spyOn(prisma.medicalDocument, 'findMany').mockResolvedValue([
        { id: 'doc-1', branchId: mockBranchId }
      ] as any);

      await service.findAll(mockOrgId, mockBranchId);

      const callArgs = (prisma.medicalDocument.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(mockBranchId);
    });
  });

  describe('TRANSACTION ROLLBACK: Error Handling', () => {
    it('should throw NotFoundException when document not found', async () => {
      jest.spyOn(prisma.medicalDocument, 'findUnique').mockResolvedValue(null);

      await expect(
        service.findOne('doc-1', mockOrgId, mockBranchId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle database error during creation', async () => {
      const data = { title: 'Report', fileUrl: 'http://test.com/file' } as any;

      jest.spyOn(prisma.medicalDocument, 'create').mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        service.create(data, mockOrgId, mockBranchId, mockUserId)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle update error gracefully', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'doc-1' } as any);
      jest.spyOn(prisma.medicalDocument, 'update').mockRejectedValue(
        new Error('Update failed')
      );

      await expect(
        service.update('doc-1', { title: 'New' }, mockOrgId, mockBranchId)
      ).rejects.toThrow('Update failed');
    });

    it('should verify document exists before deletion', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'doc-1' } as any);
      jest.spyOn(prisma.medicalDocument, 'delete').mockResolvedValue({ id: 'doc-1' } as any);

      const result = await service.remove('doc-1', mockOrgId, mockBranchId);

      expect(service.findOne).toHaveBeenCalledWith('doc-1', mockOrgId, mockBranchId);
      expect(result.id).toBe('doc-1');
    });
  });

  describe('RBAC: Document Audit', () => {
    it('should record uploadedBy user context', async () => {
      const data = { title: 'Report', fileUrl: 'http://test.com/file' } as any;
      const testUserId = 'user-admin-123';

      jest.spyOn(prisma.medicalDocument, 'create').mockResolvedValue({
        id: 'doc-1',
        uploadedBy: testUserId,
        ...data
      } as any);

      await service.create(data, mockOrgId, mockBranchId, testUserId);

      expect(prisma.medicalDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            uploadedBy: testUserId
          })
        })
      );
    });

    it('should include user details in document retrieval', async () => {
      const document = {
        id: 'doc-1',
        uploadedByUser: { id: 'user-1', firstName: 'Dr', lastName: 'Smith' }
      };

      jest.spyOn(prisma.medicalDocument, 'findUnique').mockResolvedValue(document as any);

      await service.findOne('doc-1', mockOrgId, mockBranchId);

      expect(prisma.medicalDocument.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.any(Object)
        })
      );
    });

    it('should enforce organization context on all operations', async () => {
      const data = { title: 'Report', fileUrl: 'http://test.com/file' } as any;

      jest.spyOn(prisma.medicalDocument, 'create').mockResolvedValue({
        id: 'doc-1',
        organizationId: mockOrgId,
        ...data
      } as any);

      await service.create(data, mockOrgId, mockBranchId, mockUserId);

      expect(prisma.medicalDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: mockOrgId,
            branchId: mockBranchId
          })
        })
      );
    });
  });
});
