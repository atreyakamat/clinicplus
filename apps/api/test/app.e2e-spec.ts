import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';

describe('App & health probes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the API banner without authentication', async () => {
    const res = await http().get('/').expect(200);
    expect(res.body.data).toBe('ClinicPlus API');
  });

  it('GET /health/live is unauthenticated and does not touch dependencies', async () => {
    const spy = jest.spyOn(prisma, '$queryRaw');
    const res = await http().get('/health/live').expect(200);
    expect(res.body.data.status).toBe('ok');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('GET /health/ready checks the database and object storage', async () => {
    const res = await http().get('/health/ready').expect(200);
    expect(res.body.data).toMatchObject({ status: 'ok', checks: { database: { status: 'up' }, storage: { status: 'up' } } });
  });

  it('GET /health/ready returns 503 when the database is unreachable', async () => {
    const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));
    const res = await http().get('/health/ready');
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(res.body.message).toContain('database');
  });

  it('GET /health (legacy combined check) still works', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('probes are cheap', async () => {
    const started = Date.now();
    await http().get('/health/live').expect(200);
    await http().get('/health/ready').expect(200);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
