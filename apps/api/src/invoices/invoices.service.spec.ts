import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockUserId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: PrismaService,
          useValue: {
            invoice: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            payment: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an invoice with items', async () => {
      const invoiceData = {
        patientId: 'patient-1',
        total: 100,
        items: [{ itemName: 'Consultation', quantity: 1, unitPrice: 100, amount: 100 }],
      };

      jest.spyOn(prisma.invoice, 'create').mockResolvedValue({ id: 'inv-1', ...invoiceData } as any);

      const result = await service.create(invoiceData, mockOrgId, mockBranchId, mockUserId);
      
      expect(result.id).toBe('inv-1');
      expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          organizationId: mockOrgId,
          items: expect.objectContaining({
            create: expect.arrayContaining([expect.objectContaining({ itemName: 'Consultation' })])
          })
        })
      }));
    });
  });

  describe('findOne', () => {
    it('should return an invoice if found', async () => {
      jest.spyOn(prisma.invoice, 'findFirst').mockResolvedValue({ id: 'inv-1' } as any);
      
      const result = await service.findOne('inv-1', mockOrgId, mockBranchId);
      expect(result.id).toBe('inv-1');
    });

    it('should throw NotFoundException if not found', async () => {
      jest.spyOn(prisma.invoice, 'findFirst').mockResolvedValue(null);
      
      await expect(service.findOne('non-existent', mockOrgId, mockBranchId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('addPayment', () => {
    it('should create a payment record', async () => {
      const paymentData = { amount: 100, paymentMethod: 'CASH' };
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'inv-1' } as any);
      jest.spyOn(prisma.payment, 'create').mockResolvedValue({ id: 'pay-1', ...paymentData } as any);

      const result = await service.addPayment('inv-1', paymentData, mockOrgId, mockBranchId);
      
      expect(result.id).toBe('pay-1');
      expect(prisma.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ invoiceId: 'inv-1', amount: 100 })
      }));
    });
  });
});
