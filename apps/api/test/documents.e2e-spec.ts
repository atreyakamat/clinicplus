import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { auth, createPatient, createTenant, createTestApp, Tenant } from './helpers/app';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const DICOM = Buffer.concat([Buffer.alloc(128, 0), Buffer.from('DICM'), Buffer.alloc(32, 2)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0)]);

const binaryParser = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Documents vault (e2e) — real storage, magic bytes, download, RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let A: Tenant;
  let B: Tenant;
  let patient: any;
  let http: () => any;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    storage = app.get(StorageService);
    http = () => request(app.getHttpServer());
    A = await createTenant(app, prisma, 'DocsA');
    B = await createTenant(app, prisma, 'DocsB');
    patient = await createPatient(app, A.receptionist);
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = (user: any, buf: Buffer, filename: string, fields: Record<string, string> = {}) => {
    let r = http().post('/api/v1/documents/upload').set(auth(user)).attach('file', buf, filename);
    const all = { patientId: patient.id, documentType: 'OTHER', title: filename, ...fields };
    for (const [k, v] of Object.entries(all)) r = r.field(k, v);
    return r;
  };

  it('stores the bytes with checksum and tenant-prefixed key; response only describes the new document', async () => {
    const res = await upload(A.receptionist, PDF, 'discharge.pdf', { documentType: 'DISCHARGE_SUMMARY', title: 'Discharge summary' });
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.mimeType).toBe('application/pdf');
    expect(d.fileSize).toBe(PDF.length);
    expect(d.checksum).toBe(createHash('sha256').update(PDF).digest('hex'));
    expect(d).not.toHaveProperty('storageKey');
    expect(Array.isArray(d)).toBe(false);

    const row = await prisma.medicalDocument.findUnique({ where: { id: d.id } });
    expect(row!.storageKey).toMatch(new RegExp(`^org/${A.org.id}/documents/[0-9a-f-]{36}\\.pdf$`));
    expect(row!.uploadedBy).toBe(A.receptionist.id);
    expect(row!.fileUrl).toBe(`/api/v1/documents/${d.id}/download`);
    expect((await storage.getBuffer(row!.storageKey!)).equals(PDF)).toBe(true);
  });

  it('detects type by magic bytes, not by the client content-type / extension', async () => {
    const png = await upload(A.doctor, PNG, 'xray.pdf');
    expect(png.status).toBe(201);
    expect(png.body.data.mimeType).toBe('image/png');
    const dcm = await upload(A.doctor, DICOM, 'scan.dcm', { documentType: 'IMAGING' });
    expect(dcm.status).toBe(201);
    expect(dcm.body.data.mimeType).toBe('application/dicom');
    expect(await prisma.imagingReport.count({ where: { documentId: dcm.body.data.id } })).toBe(1);

    const exe = await upload(A.doctor, EXE, 'report.pdf');
    expect(exe.status).toBe(400);
    expect((await upload(A.doctor, Buffer.alloc(0), 'empty.pdf')).status).toBe(400);
  });

  it('rejects files over MAX_UPLOAD_MB', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024, 0x20)]);
    const res = await upload(A.doctor, big, 'big.pdf');
    expect(res.status).toBe(413);
  });

  it('validates fields and tenant ownership of patient / consultation', async () => {
    expect((await upload(A.doctor, PDF, 'a.pdf', { documentType: 'MALWARE' })).status).toBe(400);
    const foreign = await createPatient(app, B.receptionist);
    expect((await upload(A.doctor, PDF, 'a.pdf', { patientId: foreign.id })).status).toBe(404);
    const other = await createPatient(app, A.receptionist);
    const cons = (await http().post('/api/v1/consultations').set(auth(A.doctor)).send({ patientId: other.id })).body.data;
    expect((await upload(A.doctor, PDF, 'a.pdf', { consultationId: cons.id })).status).toBe(400);
  });

  it('LAB_REPORT creates a LabReport linked to the consultation; list filters work', async () => {
    const cons = (await http().post('/api/v1/consultations').set(auth(A.doctor)).send({ patientId: patient.id })).body.data;
    const lab = await upload(A.nurse, PDF, 'cbc.pdf', { documentType: 'LAB_REPORT', title: 'CBC', consultationId: cons.id });
    expect(lab.status).toBe(201);
    const lr = await prisma.labReport.findFirst({ where: { documentId: lab.body.data.id } });
    expect(lr?.consultationId).toBe(cons.id);

    const byType = await http().get(`/api/v1/documents?patientId=${patient.id}&documentType=LAB_REPORT`).set(auth(A.doctor));
    expect(byType.status).toBe(200);
    expect(byType.body.data.map((x: any) => x.id)).toEqual([lab.body.data.id]);
    expect(byType.body.data[0]).not.toHaveProperty('storageKey');
    expect(byType.body.data[0].hasFile).toBe(true);
    const byCons = await http().get(`/api/v1/documents?consultationId=${cons.id}`).set(auth(A.doctor));
    expect(byCons.body.data.map((x: any) => x.id)).toEqual([lab.body.data.id]);
  });

  it('authenticated streaming download with Content-Disposition and an audit entry', async () => {
    const up = (await upload(A.doctor, PDF, 'report.pdf', { title: 'Blood report' })).body.data;
    const res = await http().get(`/api/v1/documents/${up.id}/download`).set(auth(A.nurse)).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Blood report\.pdf"/);
    expect((res.body as Buffer).equals(PDF)).toBe(true);

    const inline = await http().get(`/api/v1/documents/${up.id}/download?disposition=inline`).set(auth(A.doctor)).buffer(true).parse(binaryParser);
    expect(inline.headers['content-disposition']).toMatch(/^inline;/);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: A.org.id, entityId: up.id, action: 'DOWNLOAD', actorId: A.nurse.id },
    });
    expect(audit).toBeTruthy();
    expect((await http().get(`/api/v1/documents/${up.id}/download`)).status).toBe(401);
  });

  it('RBAC: receptionist can upload but cannot list, view or download', async () => {
    const up = (await upload(A.receptionist, PNG, 'id-card.png', { documentType: 'ID_PROOF' })).body.data;
    expect((await http().get('/api/v1/documents').set(auth(A.receptionist))).status).toBe(403);
    expect((await http().get(`/api/v1/documents/${up.id}`).set(auth(A.receptionist))).status).toBe(403);
    expect((await http().get(`/api/v1/documents/${up.id}/download`).set(auth(A.receptionist))).status).toBe(403);
    expect((await upload(A.accountant, PDF, 'x.pdf')).status).toBe(403);
  });

  it('cross-tenant: tenant B cannot read, download, edit or delete tenant A documents', async () => {
    const up = (await upload(A.doctor, PDF, 'private.pdf')).body.data;
    expect((await http().get(`/api/v1/documents/${up.id}/download`).set(auth(B.doctor))).status).toBe(404);
    expect((await http().get(`/api/v1/documents/${up.id}`).set(auth(B.owner))).status).toBe(404);
    expect((await http().patch(`/api/v1/documents/${up.id}`).set(auth(B.owner)).send({ title: 'x' })).status).toBe(404);
    expect((await http().delete(`/api/v1/documents/${up.id}`).set(auth(B.owner))).status).toBe(404);
    const listB = await http().get('/api/v1/documents').set(auth(B.owner));
    expect(listB.body.data.some((d: any) => d.id === up.id)).toBe(false);
  });

  it('update metadata syncs report rows; delete removes the row and the stored object', async () => {
    const up = (await upload(A.doctor, PDF, 'misc.pdf')).body.data;
    expect((await http().patch(`/api/v1/documents/${up.id}`).set(auth(A.doctor)).send({ title: 'x' })).status).toBe(403); // doctor lacks documents.update
    const upd = await http().patch(`/api/v1/documents/${up.id}`).set(auth(A.owner)).send({ title: 'Lipid profile', documentType: 'LAB_REPORT' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.title).toBe('Lipid profile');
    expect(await prisma.labReport.count({ where: { documentId: up.id } })).toBe(1);

    const key = (await prisma.medicalDocument.findUnique({ where: { id: up.id } }))!.storageKey!;
    expect(await storage.exists(key)).toBe(true);
    expect((await http().delete(`/api/v1/documents/${up.id}`).set(auth(A.doctor))).status).toBe(403);
    const del = await http().delete(`/api/v1/documents/${up.id}`).set(auth(A.owner));
    expect(del.status).toBe(200);
    expect(await prisma.medicalDocument.findUnique({ where: { id: up.id } })).toBeNull();
    expect(await prisma.labReport.count({ where: { documentId: up.id } })).toBe(0);
    expect(await storage.exists(key)).toBe(false);

    const tl = await http().get(`/api/v1/timeline?patientId=${patient.id}&category=DOCUMENT&limit=100`).set(auth(A.doctor));
    const types = tl.body.data.map((e: any) => e.eventType);
    expect(types).toContain('DOCUMENT_UPLOADED');
    expect(types).toContain('DOCUMENT_DELETED');
  });
});
