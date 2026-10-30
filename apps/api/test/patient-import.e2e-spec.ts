import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTestApp, createTenant, Tenant } from './helpers/app';

/**
 * Bulk patient CSV import: valid rows, duplicate skipping, malformed-row
 * reporting, dry-run, RBAC and cross-tenant isolation, and the row cap.
 */
describe('Patient CSV import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  const http = () => request(app.getHttpServer());

  const HEADER = 'firstName,lastName,gender,dateOfBirth,phone,email,bloodGroup';
  let phoneSeq = 700000000;
  const uniqPhone = () => `9${(phoneSeq++).toString().padStart(9, '0')}`.slice(0, 10);

  const importCsv = (user: any, csv: string, dryRun = false) =>
    http()
      .post(`/api/v1/patients/import${dryRun ? '?dryRun=true' : ''}`)
      .set(auth(user))
      .attach('file', Buffer.from(csv, 'utf8'), 'patients.csv');

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'ImportClinicA', { roles: ['Organization Owner', 'Receptionist', 'Doctor'] });
    B = await createTenant(app, prisma, 'ImportClinicB', { roles: ['Organization Owner'] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a downloadable CSV template', async () => {
    const tpl = await http().get('/api/v1/patients/import/template').set(auth(A.owner));
    expect(tpl.status).toBe(200);
    expect(tpl.headers['content-type']).toMatch(/text\/csv/);
    expect(tpl.headers['content-disposition']).toMatch(/attachment; filename=/);
    expect(tpl.text.split('\n')[0]).toContain('firstName');
  });

  it('creates valid patients scoped to the caller org and branch', async () => {
    const p1 = uniqPhone();
    const p2 = uniqPhone();
    const csv = [
      HEADER,
      `Asha,Rao,FEMALE,1990-04-12,${p1},asha.${p1}@example.com,O+`,
      `Rahul,Kamat,MALE,1985-11-30,${p2},,B+`,
    ].join('\n');

    const res = await importCsv(A.owner, csv);
    expect(res.status).toBe(200);
    expect(res.body.data.dryRun).toBe(false);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.errors).toBe(0);
    expect(res.body.data.skippedDuplicates).toBe(0);

    const codes = res.body.data.rows.filter((r: any) => r.status === 'created').map((r: any) => r.patientCode);
    expect(codes).toHaveLength(2);
    const created = await prisma.patient.findMany({ where: { organizationId: A.org.id, patientCode: { in: codes } } });
    expect(created).toHaveLength(2);
    for (const c of created) {
      expect(c.organizationId).toBe(A.org.id);
      expect(c.branchId).toBe(A.branch.id);
    }
  });

  it('dry run validates and previews without inserting anything', async () => {
    const phone = uniqPhone();
    const csv = [HEADER, `Dry,Run,MALE,2000-01-01,${phone},,`].join('\n');
    const res = await importCsv(A.owner, csv, true);
    expect(res.status).toBe(200);
    expect(res.body.data.dryRun).toBe(true);
    expect(res.body.data.created).toBe(1);
    const inDb = await prisma.patient.count({ where: { organizationId: A.org.id, phone } });
    expect(inDb).toBe(0);
  });

  it('skips duplicates (existing record and within-file) instead of erroring', async () => {
    const existing = await createPatient(app, A.owner, { firstName: 'Dup', lastName: 'Existing' });
    const dupPhone = existing.phone as string;
    const newPhone = uniqPhone();

    const csv = [
      HEADER,
      `Dup,Existing,MALE,1991-02-02,${dupPhone},,`, // duplicate of an existing patient
      `Fresh,One,MALE,1992-03-03,${newPhone},,`, // new
      `Fresh,Two,FEMALE,1993-04-04,${newPhone},,`, // within-file duplicate of the previous row
    ].join('\n');

    const res = await importCsv(A.owner, csv);
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.skippedDuplicates).toBe(2);
    expect(res.body.data.errors).toBe(0);
    const statuses = res.body.data.rows.map((r: any) => r.status);
    expect(statuses).toEqual(['skipped-duplicate', 'created', 'skipped-duplicate']);
  });

  it('reports malformed rows per row and still imports the valid ones', async () => {
    const good = uniqPhone();
    const csv = [
      HEADER,
      `NoLast,,MALE,1990-01-01,${uniqPhone()},,`, // missing lastName
      `Bad,Gender,ROBOT,1990-01-01,${uniqPhone()},,`, // invalid gender
      `Bad,Dob,MALE,not-a-date,${uniqPhone()},,`, // invalid dob
      `Bad,Email,MALE,1990-01-01,${uniqPhone()},not-an-email,`, // invalid email
      `Good,Row,FEMALE,1990-01-01,${good},,A+`, // valid
    ].join('\n');

    const res = await importCsv(A.owner, csv);
    expect(res.status).toBe(200);
    expect(res.body.data.errors).toBe(4);
    expect(res.body.data.created).toBe(1);
    const errorRows = res.body.data.rows.filter((r: any) => r.status === 'error');
    expect(errorRows).toHaveLength(4);
    expect(errorRows.every((r: any) => typeof r.message === 'string' && r.message.length > 0)).toBe(true);
  });

  it('RBAC: Receptionist and Doctor lack patients.import (403)', async () => {
    const csv = [HEADER, `No,Perm,MALE,1990-01-01,${uniqPhone()},,`].join('\n');
    expect((await importCsv(A.receptionist, csv)).status).toBe(403);
    expect((await importCsv(A.doctor, csv)).status).toBe(403);
    expect((await http().get('/api/v1/patients/import/template').set(auth(A.receptionist))).status).toBe(403);
  });

  it('cross-tenant: a phone that exists in another org is NOT treated as a duplicate and only lands in the caller org', async () => {
    const sharedPhone = uniqPhone();
    // Same phone already used by a patient in tenant B.
    await createPatient(app, B.owner, { firstName: 'Bee', lastName: 'Patient', phone: sharedPhone });

    const csv = [HEADER, `Across,Tenant,MALE,1994-05-05,${sharedPhone},,`].join('\n');
    const res = await importCsv(A.owner, csv);
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);

    const inA = await prisma.patient.count({ where: { organizationId: A.org.id, phone: sharedPhone } });
    const inB = await prisma.patient.count({ where: { organizationId: B.org.id, phone: sharedPhone } });
    expect(inA).toBe(1);
    expect(inB).toBe(1);
  });

  it('rejects an import with too many rows', async () => {
    const rows = [HEADER];
    for (let i = 0; i < 5001; i++) rows.push(`Row${i},Many,MALE,1990-01-01,,,`);
    const res = await importCsv(A.owner, rows.join('\n'));
    expect(res.status).toBe(400);
    expect((res.body.message || res.body.errors?.join(' ') || '')).toMatch(/row/i);
  });

  it('rejects an empty upload', async () => {
    const res = await http().post('/api/v1/patients/import').set(auth(A.owner));
    expect(res.status).toBe(400);
  });
});
