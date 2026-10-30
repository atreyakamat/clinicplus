import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TaskAutomationService } from '../src/tasks/task-automation.service';
import { auth, createPatient, createTenant, createTestApp, Tenant, uniq } from './helpers/app';

const DAY = 24 * 3600_000;

describe('Tasks, comments & workflows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let patient: any;
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    http = () => request(app.getHttpServer());
    A = await createTenant(app, prisma, 'Task Clinic A');
    B = await createTenant(app, prisma, 'Task Clinic B');
    patient = await createPatient(app, A.receptionist);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('assignment rules and visibility', () => {
    let nurseTask: any;
    let managerTask: any;

    it('without tasks.assign a new task is assigned to yourself', async () => {
      const res = await http()
        .post('/api/v1/tasks')
        .set(auth(A.nurse))
        .send({ title: 'Restock dressing kits', priority: 'HIGH', dueDate: new Date(Date.now() + DAY).toISOString() });
      expect(res.status).toBe(201);
      expect(res.body.data.assignedTo).toBe(A.nurse.id);
      expect(res.body.data.createdBy).toBe(A.nurse.id);
      nurseTask = res.body.data;
    });

    it('without tasks.assign you cannot assign to others (403)', async () => {
      const res = await http()
        .post('/api/v1/tasks')
        .set(auth(A.nurse))
        .send({ title: 'Call lab', assignedTo: A.receptionist.id });
      expect(res.status).toBe(403);
    });

    it('a manager assigns to staff; assignee must belong to the tenant', async () => {
      const res = await http()
        .post('/api/v1/tasks')
        .set(auth(A.manager))
        .send({ title: 'Review lab report', assignedTo: A.doctor.id, patientId: patient.id, priority: 'URGENT' });
      expect(res.status).toBe(201);
      expect(res.body.data.assignee.id).toBe(A.doctor.id);
      expect(res.body.data.patient.id).toBe(patient.id);
      managerTask = res.body.data;

      const cross = await http()
        .post('/api/v1/tasks')
        .set(auth(A.manager))
        .send({ title: 'x', assignedTo: B.doctor.id });
      expect(cross.status).toBe(404);
      const crossPatient = await http()
        .post('/api/v1/tasks')
        .set(auth(A.manager))
        .send({ title: 'x', patientId: (await createPatient(app, B.receptionist)).id });
      expect(crossPatient.status).toBe(404);
      const accountant = await http().post('/api/v1/tasks').set(auth(A.accountant)).send({ title: 'x' });
      expect(accountant.status).toBe(403);
    });

    it('users without tasks.assign only see their own tasks', async () => {
      const nurseAll = await http().get('/api/v1/tasks?scope=all').set(auth(A.nurse));
      expect(nurseAll.status).toBe(200);
      const ids = nurseAll.body.data.map((t: any) => t.id);
      expect(ids).toContain(nurseTask.id);
      expect(ids).not.toContain(managerTask.id);
      const peek = await http().get(`/api/v1/tasks/${managerTask.id}`).set(auth(A.nurse));
      expect(peek.status).toBe(404);
      const patch = await http().patch(`/api/v1/tasks/${managerTask.id}`).set(auth(A.nurse)).send({ status: 'COMPLETED' });
      expect(patch.status).toBe(404);

      const doctorMine = await http().get('/api/v1/tasks').set(auth(A.doctor));
      expect(doctorMine.body.data.map((t: any) => t.id)).toEqual([managerTask.id]);
    });

    it('managers see all branch tasks with scope=all, "mine" by default', async () => {
      const all = await http().get('/api/v1/tasks?scope=all').set(auth(A.manager));
      const ids = all.body.data.map((t: any) => t.id);
      expect(ids).toEqual(expect.arrayContaining([nurseTask.id, managerTask.id]));
      const mine = await http().get('/api/v1/tasks').set(auth(A.manager));
      expect(mine.body.data.map((t: any) => t.id)).toEqual([managerTask.id]);
      const urgent = await http().get('/api/v1/tasks?scope=all&priority=URGENT').set(auth(A.manager));
      expect(urgent.body.data.map((t: any) => t.id)).toEqual([managerTask.id]);
      const summary = await http().get('/api/v1/tasks/summary?scope=all').set(auth(A.manager));
      expect(summary.body.data).toMatchObject({ scope: 'all', open: 2, urgent: 1 });
    });

    it('assignee cannot reassign without tasks.assign; completion stamps completedAt', async () => {
      const re = await http().patch(`/api/v1/tasks/${managerTask.id}`).set(auth(A.doctor)).send({ assignedTo: A.nurse.id });
      expect(re.status).toBe(403);
      const done = await http().patch(`/api/v1/tasks/${managerTask.id}`).set(auth(A.doctor)).send({ status: 'COMPLETED' });
      expect(done.status).toBe(200);
      expect(done.body.data.completedAt).toBeTruthy();
      const openOnly = await http().get('/api/v1/tasks').set(auth(A.doctor));
      expect(openOnly.body.data).toHaveLength(0);
      const closed = await http().get('/api/v1/tasks?includeClosed=true').set(auth(A.doctor));
      expect(closed.body.data.map((t: any) => t.id)).toEqual([managerTask.id]);
      const reopen = await http().patch(`/api/v1/tasks/${managerTask.id}`).set(auth(A.doctor)).send({ status: 'OPEN' });
      expect(reopen.body.data.completedAt).toBeNull();
      const bad = await http().patch(`/api/v1/tasks/${managerTask.id}`).set(auth(A.doctor)).send({ status: 'DONE' });
      expect(bad.status).toBe(400);
    });

    it('comments: list/add on visible tasks only', async () => {
      const add = await http()
        .post(`/api/v1/tasks/${managerTask.id}/comments`)
        .set(auth(A.doctor))
        .send({ comment: 'Report looks fine, will call patient' });
      expect(add.status).toBe(201);
      expect(add.body.data.user.id).toBe(A.doctor.id);
      const list = await http().get(`/api/v1/tasks/${managerTask.id}/comments`).set(auth(A.manager));
      expect(list.body.data).toHaveLength(1);
      const nurse = await http().post(`/api/v1/tasks/${managerTask.id}/comments`).set(auth(A.nurse)).send({ comment: 'hi' });
      expect(nurse.status).toBe(404);
      const empty = await http().post(`/api/v1/tasks/${managerTask.id}/comments`).set(auth(A.doctor)).send({ comment: ' ' });
      expect(empty.status).toBe(400);
    });

    it('tenant B cannot see or change tenant A tasks', async () => {
      expect((await http().get(`/api/v1/tasks/${managerTask.id}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().patch(`/api/v1/tasks/${managerTask.id}`).set(auth(B.owner)).send({ title: 'x' })).status).toBe(404);
      expect((await http().delete(`/api/v1/tasks/${managerTask.id}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().get(`/api/v1/tasks/${managerTask.id}/comments`).set(auth(B.owner))).status).toBe(404);
      const list = await http().get('/api/v1/tasks?scope=all').set(auth(B.owner));
      expect(list.body.meta.total).toBe(0);
    });

    it('assignee picker requires tasks.assign', async () => {
      expect((await http().get('/api/v1/tasks/assignees').set(auth(A.nurse))).status).toBe(403);
      const res = await http().get('/api/v1/tasks/assignees').set(auth(A.manager));
      expect(res.status).toBe(200);
      expect(res.body.data.map((u: any) => u.id)).toContain(A.receptionist.id);
    });

    it('delete soft-cancels (tasks.delete)', async () => {
      expect((await http().delete(`/api/v1/tasks/${nurseTask.id}`).set(auth(A.receptionist))).status).toBe(403);
      const res = await http().delete(`/api/v1/tasks/${nurseTask.id}`).set(auth(A.manager));
      expect(res.status).toBe(200);
      expect((await http().get(`/api/v1/tasks/${nurseTask.id}`).set(auth(A.nurse))).status).toBe(404);
    });
  });

  describe('workflow templates', () => {
    let templateId: string;

    it('only workflows.manage can create templates', async () => {
      const body = {
        name: 'Post-surgery care',
        trigger: 'POST_PROCEDURE',
        steps: [
          { title: 'Day-1 check-in call', offsetDays: 1, assigneeRole: 'Receptionist' },
          { title: 'Dressing change', offsetDays: 3, assigneeRole: 'Nurse', priority: 'HIGH' },
          { title: 'Review healing', offsetDays: 7, assigneeRole: 'Doctor' },
        ],
      };
      expect((await http().post('/api/v1/workflow-templates').set(auth(A.manager)).send(body)).status).toBe(403);
      const bad = await http()
        .post('/api/v1/workflow-templates')
        .set(auth(A.owner))
        .send({ name: 'Bad', steps: [{ title: 'x', offsetDays: -1 }] });
      expect(bad.status).toBe(400);
      const res = await http().post('/api/v1/workflow-templates').set(auth(A.owner)).send(body);
      expect(res.status).toBe(201);
      expect(res.body.data.steps).toHaveLength(3);
      templateId = res.body.data.id;
      const list = await http().get('/api/v1/workflow-templates').set(auth(A.manager));
      expect(list.body.data.map((t: any) => t.id)).toContain(templateId);
    });

    it('starts a workflow for a patient with role-resolved assignees', async () => {
      const denied = await http()
        .post(`/api/v1/workflow-templates/${templateId}/start`)
        .set(auth(A.nurse))
        .send({ patientId: patient.id });
      expect(denied.status).toBe(403);

      const start = new Date();
      const res = await http()
        .post(`/api/v1/workflow-templates/${templateId}/start`)
        .set(auth(A.manager))
        .send({ patientId: patient.id, startDate: start.toISOString() });
      expect(res.status).toBe(201);
      const tasks = res.body.data.tasks;
      expect(tasks).toHaveLength(3);
      expect(tasks.map((t: any) => t.assignedTo)).toEqual([A.receptionist.id, A.nurse.id, A.doctor.id]);
      expect(tasks.every((t: any) => t.patientId === patient.id && t.sourceType === 'WORKFLOW')).toBe(true);
      const due = new Date(tasks[2].dueDate).getTime();
      expect(Math.round((due - start.getTime()) / DAY)).toBe(7);

      // The nurse sees her workflow step in "my tasks".
      const nurse = await http().get('/api/v1/tasks').set(auth(A.nurse));
      expect(nurse.body.data.some((t: any) => t.id === tasks[1].id)).toBe(true);
    });

    it('tenant B cannot read, change or start tenant A templates', async () => {
      expect((await http().get(`/api/v1/workflow-templates/${templateId}`).set(auth(B.owner))).status).toBe(404);
      expect(
        (await http().patch(`/api/v1/workflow-templates/${templateId}`).set(auth(B.owner)).send({ name: 'x' })).status,
      ).toBe(404);
      const bPatient = await createPatient(app, B.receptionist);
      expect(
        (await http().post(`/api/v1/workflow-templates/${templateId}/start`).set(auth(B.owner)).send({ patientId: bPatient.id }))
          .status,
      ).toBe(404);
      // A cannot start its own template for B's patient either.
      expect(
        (await http().post(`/api/v1/workflow-templates/${templateId}/start`).set(auth(A.manager)).send({ patientId: bPatient.id }))
          .status,
      ).toBe(404);
    });

    it('deactivated templates cannot be started; delete hides them', async () => {
      await http().patch(`/api/v1/workflow-templates/${templateId}`).set(auth(A.owner)).send({ status: 'INACTIVE' }).expect(200);
      const res = await http()
        .post(`/api/v1/workflow-templates/${templateId}/start`)
        .set(auth(A.manager))
        .send({ patientId: patient.id });
      expect(res.status).toBe(400);
      await http().delete(`/api/v1/workflow-templates/${templateId}`).set(auth(A.owner)).expect(200);
      expect((await http().get(`/api/v1/workflow-templates/${templateId}`).set(auth(A.owner))).status).toBe(404);
    });
  });

  describe('automatic tasks', () => {
    it('creates one collection task per overdue invoice, for staff who can see tasks', async () => {
      const inv = await prisma.invoice.create({
        data: {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId: patient.id,
          invoiceNumber: uniq('INV'),
          total: 1500,
          subtotal: 1500,
          status: 'SENT',
          dueDate: new Date(Date.now() - 3 * DAY),
        },
      });
      const paid = await prisma.invoice.create({
        data: {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId: patient.id,
          invoiceNumber: uniq('INV'),
          total: 100,
          status: 'PAID',
          dueDate: new Date(Date.now() - 3 * DAY),
        },
      });
      const svc = app.get(TaskAutomationService);
      const first: any = await svc.runScan(new Date(), A.org.id);
      expect(first.overdueInvoices).toBe(1);
      const task = await prisma.task.findFirst({ where: { sourceType: 'INVOICE_OVERDUE', sourceId: inv.id } });
      expect(task).toBeTruthy();
      // Accountants hold tasks.view/update, so collection tasks go to them first.
      expect(task!.assignedTo).toBe(A.accountant.id);
      expect(task!.title).toContain(inv.invoiceNumber);
      expect(await prisma.task.count({ where: { sourceId: paid.id } })).toBe(0);

      const second: any = await svc.runScan(new Date(), A.org.id);
      expect(second.overdueInvoices).toBe(0);
      expect(await prisma.task.count({ where: { sourceType: 'INVOICE_OVERDUE', sourceId: inv.id } })).toBe(1);
    });
  });
});
