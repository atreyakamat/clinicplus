/**
 * Database integrity: unique constraints, foreign keys, soft delete, transactional writes,
 * race-safe sequence numbers, audit timestamps, tenant columns and indexes.
 * Everything runs inside suite-owned tenants; nothing is deleted or truncated.
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, Tenant, uniq } from './helpers/app';

const phone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;
const prismaCode = (e: unknown) => (e as any)?.code as string | undefined;

describe('Database integrity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let patient: any;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'DbA');
    B = await createTenant(app, prisma, 'DbB', { roles: ['Organization Owner', 'Receptionist'] });
    patient = await createPatient(app, A.receptionist);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('unique constraints', () => {
    it('organization slug is globally unique', async () => {
      await expect(prisma.organization.create({ data: { name: 'Dup', slug: A.org.slug } })).rejects.toMatchObject({ code: 'P2002' });
    });

    it('user email is unique within an organization', async () => {
      const err = await prisma.user
        .create({
          data: { organizationId: A.org.id, branchId: A.branch.id, email: A.doctor.email, passwordHash: 'x', firstName: 'D', lastName: 'Up' },
        })
        .catch((e) => e);
      expect(prismaCode(err)).toBe('P2002');
    });

    it('invoice number is unique per organization (but may repeat across organizations)', async () => {
      const inv = await http()
        .post('/api/v1/invoices')
        .set(auth(A.receptionist))
        .send({ patientId: patient.id, items: [{ itemName: 'Consultation', quantity: 1, unitPrice: 100 }] });
      expect(inv.status).toBe(201);
      const base = { patientId: patient.id, organizationId: A.org.id, branchId: A.branch.id, invoiceNumber: inv.body.data.invoiceNumber, total: 1 };
      expect(prismaCode(await prisma.invoice.create({ data: base }).catch((e) => e))).toBe('P2002');

      const pB = await createPatient(app, B.receptionist);
      const other = await prisma.invoice.create({
        data: { ...base, patientId: pB.id, organizationId: B.org.id, branchId: B.branch.id },
      });
      expect(other.invoiceNumber).toBe(inv.body.data.invoiceNumber);
    });

    it('patient code is unique per organization; API maps the clash to 409', async () => {
      const code = `DUP-${Date.now().toString(36).toUpperCase()}`;
      const first = await createPatient(app, A.receptionist, { patientCode: code });
      expect(first.patientCode).toBe(code);
      const second = await http()
        .post('/api/v1/patients')
        .set(auth(A.receptionist))
        .send({ firstName: 'Dup', lastName: 'Code', phone: phone(), patientCode: code });
      expect(second.status).toBe(409);
      // Same code is fine in another organization.
      const inB = await createPatient(app, B.receptionist, { patientCode: code });
      expect(inB.patientCode).toBe(code);
    });
  });

  describe('foreign keys', () => {
    const ghost = '00000000-0000-4000-8000-00000000dead';

    it('rejects rows pointing at missing parents', async () => {
      expect(prismaCode(await prisma.branch.create({ data: { name: 'Orphan', organizationId: ghost } }).catch((e) => e))).toBe('P2003');
      expect(
        prismaCode(
          await prisma.patient.create({ data: { firstName: 'O', lastName: 'Rphan', organizationId: ghost, branchId: A.branch.id } }).catch((e) => e),
        ),
      ).toBe('P2003');
      expect(
        prismaCode(
          await prisma.appointment
            .create({
              data: {
                organizationId: A.org.id,
                branchId: A.branch.id,
                patientId: ghost,
                doctorId: A.doctor.id,
                scheduledStart: new Date(),
                scheduledEnd: new Date(Date.now() + 900_000),
              },
            })
            .catch((e) => e),
        ),
      ).toBe('P2003');
    });

    it('API returns 404 (not 500) for references to missing rows', async () => {
      const res = await http().post('/api/v1/invoices').set(auth(A.receptionist)).send({ patientId: ghost, items: [{ itemName: 'X', quantity: 1, unitPrice: 1 }] });
      expect(res.status).toBe(404);
    });
  });

  describe('soft delete', () => {
    it('archiving keeps the row (deletedAt set) and restore clears it', async () => {
      const p = await createPatient(app, A.receptionist);
      const del = await http().delete(`/api/v1/patients/${p.id}`).set(auth(A.owner)).send({ reason: 'Duplicate record' });
      expect(del.status).toBe(200);
      const row = await prisma.patient.findUnique({ where: { id: p.id } });
      expect(row).not.toBeNull();
      expect(row!.deletedAt).toBeInstanceOf(Date);

      const list = await http().get(`/api/v1/patients?q=${encodeURIComponent(p.lastName)}`).set(auth(A.owner));
      expect(list.body.data.map((x: any) => x.id)).not.toContain(p.id);

      const restored = await http().post(`/api/v1/patients/${p.id}/restore`).set(auth(A.owner));
      expect(restored.status).toBe(201);
      expect((await prisma.patient.findUnique({ where: { id: p.id } }))!.deletedAt).toBeNull();
    });
  });

  describe('transactions and concurrency', () => {
    it('a failed patient create leaves no partial child rows', async () => {
      const code = `TX-${Date.now().toString(36).toUpperCase()}`;
      await createPatient(app, A.receptionist, { patientCode: code });
      const street = uniq('Rollback Street');
      const res = await http()
        .post('/api/v1/patients')
        .set(auth(A.receptionist))
        .send({ firstName: 'Tx', lastName: 'Fail', phone: phone(), patientCode: code, addresses: [{ addressLine1: street, city: 'Pune' }] });
      expect(res.status).toBe(409);
      expect(await prisma.patientAddress.count({ where: { organizationId: A.org.id, addressLine1: street } })).toBe(0);
    });

    it('interactive transactions roll back on error', async () => {
      const name = uniq('TxBranch');
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.branch.create({ data: { name, organizationId: A.org.id } });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await prisma.branch.count({ where: { name } })).toBe(0);
    });

    // Code/number allocation takes a per-org advisory lock, so bursts never collide.
    it('concurrent registrations get distinct patient codes', async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          http().post('/api/v1/patients').set(auth(A.receptionist)).send({ firstName: `Race${i}`, lastName: uniq('R'), phone: phone() }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
      const codes = results.map((r) => r.body.data.patientCode);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('concurrent invoices get distinct numbers', async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          http()
            .post('/api/v1/invoices')
            .set(auth(A.receptionist))
            .send({ patientId: patient.id, items: [{ itemName: 'Dressing', quantity: 1, unitPrice: 50 }] }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
      const numbers = results.map((r) => r.body.data.invoiceNumber);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it('concurrent full payments cannot overpay an invoice', async () => {
      const inv = await http()
        .post('/api/v1/invoices')
        .set(auth(A.receptionist))
        .send({ patientId: patient.id, items: [{ itemName: 'Procedure', quantity: 1, unitPrice: 800 }], issue: true });
      expect(inv.status).toBe(201);
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          http().post(`/api/v1/invoices/${inv.body.data.id}/payments`).set(auth(A.receptionist)).send({ amount: 800, paymentMethod: 'CASH' }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.every((r) => r.status < 500)).toBe(true);
      const paid = await prisma.payment.aggregate({ where: { invoiceId: inv.body.data.id, paymentStatus: 'PAID' }, _sum: { amount: true } });
      expect(Number(paid._sum.amount)).toBe(800);
      expect((await prisma.invoice.findUnique({ where: { id: inv.body.data.id } }))!.status).toBe('PAID');
    });
  });

  describe('audit fields', () => {
    it('createdAt is set and updatedAt advances on update', async () => {
      const p = await createPatient(app, A.receptionist);
      const before = await prisma.patient.findUniqueOrThrow({ where: { id: p.id } });
      expect(before.createdAt).toBeInstanceOf(Date);
      await new Promise((r) => setTimeout(r, 20));
      const upd = await http().patch(`/api/v1/patients/${p.id}`).set(auth(A.receptionist)).send({ occupation: 'Teacher' });
      expect(upd.status).toBe(200);
      const after = await prisma.patient.findUniqueOrThrow({ where: { id: p.id } });
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      expect(after.createdBy).toBe(A.receptionist.id);
    });
  });

  describe('schema: tenant columns and indexes', () => {
    const TENANT_MODELS = ['Patient', 'Appointment', 'Consultation', 'Prescription', 'Invoice', 'Payment', 'FollowUp', 'Task', 'MedicalDocument', 'QueueEntry'];

    it('tenant-scoped models carry a required organizationId', () => {
      const models = Prisma.dmmf.datamodel.models;
      for (const name of TENANT_MODELS) {
        const model = models.find((m) => m.name === name);
        expect({ name, found: !!model }).toEqual({ name, found: true });
        const field = model!.fields.find((f) => f.name === 'organizationId');
        expect({ name, required: field?.isRequired }).toEqual({ name, required: true });
      }
    });

    it('hot tenant tables are indexed by organization_id', async () => {
      const rows = await prisma.$queryRaw<Array<{ tablename: string; indexdef: string }>>`
        SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '%organization_id%'`;
      const indexed = new Set(rows.map((r) => r.tablename));
      for (const table of ['patients', 'appointments', 'invoices', 'consultations']) {
        expect({ table, indexed: indexed.has(table) }).toEqual({ table, indexed: true });
      }
    });
  });
});
