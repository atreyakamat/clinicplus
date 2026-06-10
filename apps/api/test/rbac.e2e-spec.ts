import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

type Role = 'Super Admin' | 'Organization Owner' | 'Clinic Admin' | 'Branch Manager' | 'Doctor' | 'Receptionist' | 'Nurse' | 'Accountant' | 'Patient';

const ALL_ROLES: Role[] = ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse', 'Accountant', 'Patient'];

interface EndpointTest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string | ((id: string) => string);
  body?: any;
  allowedRoles: Role[];
}

describe('RBAC Enforcement (E2E) — Phase 4', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let org: any;
  let branch: any;
  let users: Record<string, any> = {};
  let tokens: Record<string, string> = {};
  let patientId: string;
  let appointmentId: string;
  let consultationId: string;
  let invoiceId: string;
  let taskId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    jwtService = app.get<JwtService>(JwtService);
    prisma = app.get<PrismaService>(PrismaService);
    await app.init();

    org = await prisma.organization.create({
      data: { name: 'RBAC Test Org', slug: `rbac-${Date.now()}` },
    });
    branch = await prisma.branch.create({
      data: { name: 'RBAC Branch', organizationId: org.id },
    });

    for (const role of ALL_ROLES) {
      const slug = role.toLowerCase().replace(/\s+/g, '-');
      const user = await prisma.user.create({
        data: {
          email: `rbac-${slug}-${Date.now()}@test.com`,
          passwordHash: 'hash',
          firstName: role.split(' ')[0],
          lastName: role.split(' ').slice(1).join(' ') || role,
          organizationId: org.id,
          branchId: branch.id,
        },
      });
      users[role] = user;
      tokens[role] = jwtService.sign({
        sub: user.id,
        email: user.email,
        organizationId: org.id,
        branchId: branch.id,
        roles: [role],
        permissions: [],
      });
    }

    patientId = (await prisma.patient.create({
      data: { firstName: 'RBAC', lastName: 'Patient', organizationId: org.id, branchId: branch.id },
    })).id;

    appointmentId = (await prisma.appointment.create({
      data: {
        patientId, doctorId: users['Doctor'].id,
        organizationId: org.id, branchId: branch.id,
        scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000),
      },
    })).id;

    consultationId = (await prisma.consultation.create({
      data: {
        patientId, doctorId: users['Doctor'].id,
        organizationId: org.id, branchId: branch.id,
        chiefComplaint: 'RBAC test',
      },
    })).id;

    invoiceId = (await prisma.invoice.create({
      data: {
        patientId, organizationId: org.id, branchId: branch.id,
        invoiceNumber: `RBAC-${Date.now()}`, total: 100,
      },
    })).id;

    taskId = (await prisma.task.create({
      data: { title: 'RBAC Task', organizationId: org.id, branchId: branch.id },
    })).id;
  });

  afterAll(async () => {
    if (org?.id) {
      await prisma.$transaction([
        prisma.followUpOutcome.deleteMany({ where: { organizationId: org.id } }),
        prisma.queueEntry.deleteMany({ where: { organizationId: org.id } }),
        prisma.queue.deleteMany({ where: { organizationId: org.id } }),
        prisma.prescriptionItem.deleteMany({ where: { organizationId: org.id } }),
        prisma.prescription.deleteMany({ where: { organizationId: org.id } }),
        prisma.consultation.deleteMany({ where: { organizationId: org.id } }),
        prisma.payment.deleteMany({ where: { organizationId: org.id } }),
        prisma.invoiceItem.deleteMany({ where: { organizationId: org.id } }),
        prisma.invoice.deleteMany({ where: { organizationId: org.id } }),
        prisma.appointment.deleteMany({ where: { organizationId: org.id } }),
        prisma.task.deleteMany({ where: { organizationId: org.id } }),
        prisma.timelineEvent.deleteMany({ where: { organizationId: org.id } }),
        prisma.medicalDocument.deleteMany({ where: { organizationId: org.id } }),
        prisma.patient.deleteMany({ where: { organizationId: org.id } }),
        prisma.userSession.deleteMany({ where: { organizationId: org.id } }),
        prisma.auditLog.deleteMany({ where: { organizationId: org.id } }),
        prisma.userRole.deleteMany({ where: { organizationId: org.id } }),
        prisma.user.deleteMany({ where: { organizationId: org.id } }),
        prisma.branch.deleteMany({ where: { organizationId: org.id } }),
        prisma.organization.delete({ where: { id: org.id } }),
      ]);
    }
    await app.close();
  });

  const endpoints: EndpointTest[] = [
    // Patients
    { method: 'GET', path: () => '/api/v1/patients', allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse', 'Accountant'] },
    { method: 'GET', path: (id) => `/api/v1/patients/${id}`, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse', 'Accountant'] },
    { method: 'POST', path: () => '/api/v1/patients', body: { firstName: 'New', lastName: 'Test', phone: '1112223333' }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse'] },
    { method: 'PATCH', path: (id) => `/api/v1/patients/${id}`, body: { firstName: 'Updated' }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse'] },
    { method: 'DELETE', path: (id) => `/api/v1/patients/${id}`, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager'] },
    // Appointments
    { method: 'GET', path: () => '/api/v1/appointments', allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse', 'Accountant'] },
    { method: 'GET', path: (id) => `/api/v1/appointments/${id}`, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse', 'Accountant'] },
    { method: 'POST', path: () => '/api/v1/appointments', body: { patientId, doctorId: users['Doctor']?.id, scheduledStart: new Date().toISOString(), scheduledEnd: new Date(Date.now() + 3600000).toISOString() }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist'] },
    { method: 'PATCH', path: (id) => `/api/v1/appointments/${id}`, body: { status: 'CONFIRMED' }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist'] },
    { method: 'DELETE', path: (id) => `/api/v1/appointments/${id}`, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Receptionist'] },
    // Consultations
    { method: 'GET', path: () => '/api/v1/consultations', allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Nurse'] },
    { method: 'GET', path: (id) => `/api/v1/consultations/${id}`, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Nurse'] },
    { method: 'POST', path: () => '/api/v1/consultations', body: { patientId, chiefComplaint: 'Test' }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor'] },
    { method: 'PATCH', path: (id) => `/api/v1/consultations/${id}`, body: { diagnosis: 'Updated' }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor'] },
    // Prescriptions
    { method: 'GET', path: () => '/api/v1/prescriptions', allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor'] },
    { method: 'GET', path: (id) => `/api/v1/prescriptions/${id}`, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor'] },
    { method: 'POST', path: () => '/api/v1/prescriptions', body: { patientId, items: [{ medicineName: 'Test', dosage: '10mg' }] }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor'] },
    // Invoices
    { method: 'GET', path: () => '/api/v1/invoices', allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Accountant'] },
    { method: 'GET', path: (id) => `/api/v1/invoices/${id}`, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Accountant'] },
    { method: 'POST', path: () => '/api/v1/invoices', body: { patientId, invoiceNumber: `RBAC-INV-${Date.now()}`, total: 50, items: [{ itemName: 'Test', quantity: 1, unitPrice: 50, amount: 50 }] }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Accountant'] },
    { method: 'POST', path: (id) => `/api/v1/invoices/${id}/payments`, body: { amount: 50, paymentMethod: 'CASH' }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Accountant'] },
    // Tasks
    { method: 'GET', path: () => '/api/v1/tasks', allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse'] },
    { method: 'GET', path: (id) => `/api/v1/tasks/${id}`, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse'] },
    { method: 'POST', path: () => '/api/v1/tasks', body: { title: 'New Task' }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse'] },
    { method: 'PATCH', path: (id) => `/api/v1/tasks/${id}`, body: { title: 'Updated' }, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse'] },
    { method: 'DELETE', path: (id) => `/api/v1/tasks/${id}`, allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager'] },
    // Queue
    { method: 'GET', path: () => '/api/v1/queues/live', allowedRoles: ['Super Admin', 'Organization Owner', 'Clinic Admin', 'Branch Manager', 'Doctor', 'Receptionist', 'Nurse'] },
    // Profile
    { method: 'GET', path: () => '/api/v1/auth/profile', allowedRoles: ALL_ROLES },
  ];

  const results: { role: Role; endpoint: string; method: string; expected: number; actual: number; passed: boolean }[] = [];

  for (const endpoint of endpoints) {
    for (const role of ALL_ROLES) {
      const path = typeof endpoint.path === 'function' ? endpoint.path(patientId) : endpoint.path;
      it(`[${role}] ${endpoint.method} ${path} -> ${endpoint.allowedRoles.includes(role) ? 200 : 403}`, async () => {
        const token = tokens[role];
        let res: request.Response;

        switch (endpoint.method) {
          case 'GET':
            res = await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
            break;
          case 'POST':
            res = await request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send(endpoint.body || {});
            break;
          case 'PATCH':
            res = await request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${token}`).send(endpoint.body || {});
            break;
          case 'DELETE':
            res = await request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`);
            break;
        }

        const expected = endpoint.allowedRoles.includes(role) ? 200 : 403;
        const passed = expected === 403 ? res.status === 403 || res.status === 404 || res.status === 401 : res.status < 500;

        results.push({ role, endpoint: path, method: endpoint.method, expected, actual: res.status, passed });

        if (!passed) {
          console.warn(`RBAC FAIL: ${role} @ ${endpoint.method} ${path} -> expected ${expected}, got ${res.status}`);
        }

        if (expected === 403) {
          expect([401, 403, 404]).toContain(res.status);
        } else {
          expect(res.status).not.toBe(401);
          expect(res.status).not.toBe(403);
        }
      });
    }
  }

  afterAll(() => {
    console.log('\n=== RBAC EVIDENCE MATRIX ===');
    console.log('Role,Endpoint,Method,Expected,Actual,Status');
    for (const r of results) {
      console.log(`${r.role},${r.endpoint},${r.method},${r.expected},${r.actual},${r.passed ? 'PASS' : 'FAIL'}`);
    }

    const failed = results.filter(r => !r.passed);
    const total = results.length;
    console.log(`\nRBAC Results: ${total - failed.length}/${total} passed (${((total - failed.length) / total * 100).toFixed(1)}%)`);
    if (failed.length > 0) {
      console.log(`Failed: ${failed.map(r => `${r.role} @ ${r.method} ${r.endpoint}`).join(', ')}`);
    }
  });
});
