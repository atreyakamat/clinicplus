import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DocumentsService } from './documents.service';

const PDF = Buffer.from('%PDF-1.4\nhello\n%%EOF');
const user = { id: 'u1', organizationId: 'org-1', branchId: 'br-1', permissions: [] };

function build(overrides: { txError?: Error; infected?: boolean } = {}) {
  const storage = { put: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue(undefined) };
  const created: any[] = [];
  const tx = {
    medicalDocument: {
      create: jest.fn().mockImplementation(({ data }) => {
        if (overrides.txError) throw overrides.txError;
        created.push(data);
        return { ...data, uploadedAt: new Date() };
      }),
    },
    labReport: { deleteMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    imagingReport: { deleteMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn().mockImplementation((cb) => cb(tx)) };
  const tenant = {
    patient: jest.fn().mockResolvedValue({ id: 'p1', branchId: 'br-1' }),
    consultation: jest.fn().mockResolvedValue({ id: 'c1', patientId: 'p1' }),
  };
  const audit = { log: jest.fn() };
  const timeline = { emit: jest.fn() };
  const scanner = {
    scanAndValidate: jest.fn().mockImplementation(async () => {
      if (overrides.infected) throw new BadRequestException('infected');
      return { status: 'SKIPPED', engine: 'off' };
    }),
  };
  const svc = new DocumentsService(prisma as any, storage as any, tenant as any, audit as any, timeline as any, scanner as any);
  return { svc, storage, tx, created, scanner, audit };
}

const file = (buffer: Buffer) => ({ buffer, size: buffer.length, originalname: 'r.pdf', mimetype: 'application/pdf' }) as any;

describe('DocumentsService.upload', () => {
  it('stores bytes under a tenant-prefixed key with a sha256 checksum', async () => {
    const { svc, storage, created, tx } = build();
    const res = await svc.upload(file(PDF), { patientId: 'p1', documentType: 'LAB_REPORT', title: 'CBC', consultationId: 'c1' }, user);
    const [key, body, mime] = storage.put.mock.calls[0];
    expect(key).toMatch(/^org\/org-1\/documents\/[0-9a-f-]{36}\.pdf$/);
    expect(body).toBe(PDF);
    expect(mime).toBe('application/pdf');
    expect(created[0]).toMatchObject({
      storageKey: key,
      checksum: createHash('sha256').update(PDF).digest('hex'),
      fileSize: PDF.length,
      organizationId: 'org-1',
      uploadedBy: 'u1',
    });
    expect(tx.labReport.create).toHaveBeenCalledWith({ data: expect.objectContaining({ consultationId: 'c1', documentId: res.id }) });
    expect(res).not.toHaveProperty('storageKey');
  });

  it('removes the stored object when the DB write fails', async () => {
    const { svc, storage } = build({ txError: new Error('db down') });
    await expect(svc.upload(file(PDF), { patientId: 'p1', documentType: 'OTHER', title: 'x' }, user)).rejects.toThrow('db down');
    expect(storage.delete).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
  });

  it('never stores infected files', async () => {
    const { svc, storage } = build({ infected: true });
    await expect(svc.upload(file(PDF), { patientId: 'p1', documentType: 'OTHER', title: 'x' }, user)).rejects.toThrow(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });
});
