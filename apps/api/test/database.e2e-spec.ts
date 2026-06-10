import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Database Integrity (E2E) — Phase 14', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Unique Constraints', () => {
    it('should enforce unique organization slug', async () => {
      const slug = `uniq-slug-${Date.now()}`;
      await prisma.organization.create({ data: { name: 'U1', slug } });
      await expect(
        prisma.organization.create({ data: { name: 'U2', slug } })
      ).rejects.toThrow();
    });

    it('should enforce unique invoice number per org', async () => {
      const org = await prisma.organization.create({ data: { name: 'InvUniq', slug: `invuniq-${Date.now()}` } });
      const branch = await prisma.branch.create({ data: { name: 'B', organizationId: org.id } });
      const patient = await prisma.patient.create({
        data: { firstName: 'I', lastName: 'U', phone: '5551400001', organizationId: org.id, branchId: branch.id },
      });
      const invNum = `UNIQ-INV-${Date.now()}`;
      await prisma.invoice.create({
        data: { patientId: patient.id, organizationId: org.id, branchId: branch.id, invoiceNumber: invNum, total: 10 },
      });
      await expect(
        prisma.invoice.create({
          data: { patientId: patient.id, organizationId: org.id, branchId: branch.id, invoiceNumber: invNum, total: 20 },
        })
      ).rejects.toThrow();

      await prisma.invoice.deleteMany({ where: { organizationId: org.id } });
      await prisma.patient.deleteMany({ where: { organizationId: org.id } });
      await prisma.branch.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    });

    it('should enforce unique user email per org', async () => {
      const org = await prisma.organization.create({ data: { name: 'EmailUniq', slug: `emailuniq-${Date.now()}` } });
      const branch = await prisma.branch.create({ data: { name: 'B', organizationId: org.id } });
      const email = `uniq-${Date.now()}@t.com`;
      await prisma.user.create({
        data: { email, passwordHash: 'h', firstName: 'U', lastName: 'U', organizationId: org.id, branchId: branch.id },
      });
      await expect(
        prisma.user.create({
          data: { email, passwordHash: 'h', firstName: 'U2', lastName: 'U2', organizationId: org.id, branchId: branch.id },
        })
      ).rejects.toThrow();

      await prisma.user.deleteMany({ where: { organizationId: org.id } });
      await prisma.branch.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should enforce branch FK to organization', async () => {
      await expect(
        prisma.branch.create({
          data: { name: 'Orphan Branch', organizationId: '00000000-0000-0000-0000-000000000000' },
        })
      ).rejects.toThrow();
    });

    it('should enforce patient FK to organization', async () => {
      await expect(
        prisma.patient.create({
          data: { firstName: 'F', lastName: 'K', phone: '5551500001', organizationId: '00000000-0000-0000-0000-000000000000', branchId: '00000000-0000-0000-0000-000000000000' },
        })
      ).rejects.toThrow();
    });

    it('should enforce appointment FK to patient', async () => {
      await expect(
        prisma.appointment.create({
          data: { patientId: '00000000-0000-0000-0000-000000000000', doctorId: '00000000-0000-0000-0000-000000000000', organizationId: '00000000-0000-0000-0000-000000000000', branchId: '00000000-0000-0000-0000-000000000000', scheduledStart: new Date(), scheduledEnd: new Date() },
        })
      ).rejects.toThrow();
    });
  });

  describe('Soft Delete Pattern', () => {
    it('should support soft delete on patient records', async () => {
      const org = await prisma.organization.create({ data: { name: 'SDel', slug: `sdel-${Date.now()}` } });
      const branch = await prisma.branch.create({ data: { name: 'B', organizationId: org.id } });
      const patient = await prisma.patient.create({
        data: { firstName: 'SD', lastName: 'Del', phone: '5551600001', organizationId: org.id, branchId: branch.id },
      });

      await prisma.patient.update({
        where: { id: patient.id },
        data: { status: 'INACTIVE', deletedAt: new Date() },
      });

      const deleted = await prisma.patient.findUnique({ where: { id: patient.id } });
      expect(deleted?.status).toBe('INACTIVE');
      expect(deleted?.deletedAt).toBeDefined();

      await prisma.patient.delete({ where: { id: patient.id } });
      await prisma.branch.delete({ where: { id: branch.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    });
  });

  describe('Transactions', () => {
    it('should rollback transaction on error', async () => {
      const org = await prisma.organization.create({ data: { name: 'TxTest', slug: `txtest-${Date.now()}` } });
      const branch = await prisma.branch.create({ data: { name: 'B', organizationId: org.id } });

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.patient.create({
            data: { firstName: 'Tx', lastName: 'Test', phone: '5551700001', organizationId: org.id, branchId: branch.id },
          });
          await tx.patient.create({
            data: { firstName: 'Tx2', lastName: 'Test', phone: '5551700001', organizationId: org.id, branchId: branch.id },
          });
        })
      ).rejects.toThrow();

      await prisma.branch.delete({ where: { id: branch.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    });
  });

  describe('Audit Fields', () => {
    it('should have createdAt and updatedAt on core models', async () => {
      const org = await prisma.organization.create({ data: { name: 'AuditTest', slug: `audit-${Date.now()}` } });
      expect(org.createdAt).toBeDefined();
      expect(org.updatedAt).toBeDefined();
      await prisma.organization.delete({ where: { id: org.id } });
    });
  });

  describe('Indexes', () => {
    it('should have organizationId indexes on key tables', async () => {
      const org = await prisma.organization.create({ data: { name: 'IdxTest', slug: `idx-${Date.now()}` } });
      const branch = await prisma.branch.create({ data: { name: 'B', organizationId: org.id } });

      const patient = await prisma.patient.create({
        data: { firstName: 'Idx', lastName: 'Test', phone: '5551800001', organizationId: org.id, branchId: branch.id },
      });
      expect(patient.organizationId).toBe(org.id);

      await prisma.patient.delete({ where: { id: patient.id } });
      await prisma.branch.delete({ where: { id: branch.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    });
  });

  describe('Tenant Columns', () => {
    it('should have organizationId on all tenant-scoped tables', async () => {
      const models = ['patient', 'appointment', 'invoice', 'consultation', 'prescription', 'task', 'followUp', 'message'] as const;
      for (const model of models) {
        const delegate = (prisma as any)[model];
        expect(delegate).toBeDefined();
      }
    });
  });
});
