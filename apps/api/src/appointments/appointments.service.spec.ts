import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppointmentsService, TRANSITIONS } from './appointments.service';

const ORG = 'org-1';
const BRANCH = 'branch-1';

const frontDesk = {
  id: 'rec-1',
  organizationId: ORG,
  branchId: BRANCH,
  homeBranchId: BRANCH,
  orgWide: false,
  roles: ['Receptionist'],
  permissions: ['appointments.view', 'appointments.create', 'appointments.update', 'appointments.delete'],
} as any;

const doctorUser = {
  ...frontDesk,
  id: 'doc-1',
  roles: ['Doctor'],
  permissions: ['appointments.view', 'appointments.update'],
} as any;

const hourFromNow = (h: number) => new Date(Date.now() + h * 3600_000);

function setup() {
  const prisma: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    appointment: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }) => ({ id: 'appt-1', ...data })),
      update: jest.fn(async ({ where, data }) => ({ id: where.id, doctorId: 'doc-1', ...data })),
    },
    queueEntry: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    waitingList: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const tenant = {
    patient: jest.fn().mockResolvedValue({ id: 'pat-1' }),
    user: jest.fn().mockResolvedValue({ id: 'doc-1' }),
  };
  const schedule = {
    scheduleIssues: jest.fn().mockResolvedValue([]),
    branchTimezone: jest.fn().mockResolvedValue('Asia/Kolkata'),
  };
  const queues = { checkIn: jest.fn().mockResolvedValue({ id: 'entry-1' }) };
  const service = new AppointmentsService(prisma, audit as any, tenant as any, schedule as any, queues as any);
  return { service, prisma, audit, tenant, schedule, queues };
}

const dto = (startH = 24, minutes = 30) => {
  const start = hourFromNow(startH);
  return {
    patientId: 'pat-1',
    doctorId: 'doc-1',
    scheduledStart: start.toISOString(),
    scheduledEnd: new Date(start.getTime() + minutes * 60000).toISOString(),
  };
};

describe('AppointmentsService', () => {
  describe('create', () => {
    it('creates in the caller tenant/branch, validates foreign ids and audits', async () => {
      const { service, prisma, tenant, audit } = setup();
      prisma.appointment.findFirst.mockResolvedValue(null);
      const res = await service.create(frontDesk, { ...dto(), organizationId: 'evil' } as any);
      expect(tenant.patient).toHaveBeenCalledWith('pat-1', ORG);
      expect(tenant.user).toHaveBeenCalledWith('doc-1', ORG, expect.objectContaining({ role: 'Doctor' }));
      expect(prisma.appointment.create.mock.calls[0][0].data).toMatchObject({
        organizationId: ORG,
        branchId: BRANCH,
        createdBy: 'rec-1',
        status: 'SCHEDULED',
      });
      expect(res.organizationId).toBe(ORG);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', resource: 'appointment' }));
      expect(prisma.$executeRaw).toHaveBeenCalled(); // per-doctor advisory lock
    });

    it('rejects the past, inverted ranges and >8h appointments', async () => {
      const { service } = setup();
      await expect(service.create(frontDesk, dto(-2))).rejects.toBeInstanceOf(BadRequestException);
      const d = dto();
      await expect(service.create(frontDesk, { ...d, scheduledEnd: d.scheduledStart })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create(frontDesk, dto(24, 9 * 60))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects double booking with 409 (even when forced)', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findFirst.mockResolvedValue({ id: 'other' });
      await expect(service.create(frontDesk, dto())).rejects.toBeInstanceOf(ConflictException);
      await expect(service.create(frontDesk, { ...dto(), force: true })).rejects.toBeInstanceOf(ConflictException);
      const where = prisma.appointment.findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({ organizationId: ORG, doctorId: 'doc-1', status: { notIn: ['CANCELLED', 'NO_SHOW'] } });
    });

    it('rejects schedule issues unless forced by a user with appointments.update', async () => {
      const { service, prisma, schedule } = setup();
      prisma.appointment.findFirst.mockResolvedValue(null);
      schedule.scheduleIssues.mockResolvedValue(['Doctor is on leave']);
      await expect(service.create(frontDesk, dto())).rejects.toThrow(/Doctor is on leave/);
      const forced = await service.create(frontDesk, { ...dto(), force: true });
      expect(forced.scheduleOverride).toEqual(['Doctor is on leave']);
      const noUpdate = { ...frontDesk, permissions: ['appointments.create'] };
      await expect(service.create(noUpdate, { ...dto(), force: true })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('state machine', () => {
    it('has final states with no exits', () => {
      expect(TRANSITIONS.COMPLETED).toEqual([]);
      expect(TRANSITIONS.CANCELLED).toEqual([]);
      expect(TRANSITIONS.NO_SHOW).toEqual([]);
    });

    it('confirms a scheduled appointment and audits the change', async () => {
      const { service, prisma, audit } = setup();
      prisma.appointment.findFirst.mockResolvedValue({ id: 'a', status: 'SCHEDULED', doctorId: 'doc-1', scheduledStart: hourFromNow(5) });
      const res = await service.transition(frontDesk, '11111111-1111-4111-8111-111111111111', 'CONFIRMED');
      expect(res.status).toBe('CONFIRMED');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'STATUS_CONFIRMED' }));
    });

    it('cancels with a reason and cancels active queue entries', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findFirst.mockResolvedValue({ id: 'a', status: 'CHECKED_IN', doctorId: 'doc-1', scheduledStart: hourFromNow(1) });
      await service.transition(frontDesk, '11111111-1111-4111-8111-111111111111', 'CANCELLED', { reason: 'unwell' });
      expect(prisma.appointment.update.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED', cancellationReason: 'unwell' });
      expect(prisma.queueEntry.updateMany.mock.calls[0][0].data.status).toBe('CANCELLED');
    });

    it('rejects invalid transitions and premature no-shows', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findFirst.mockResolvedValue({ id: 'a', status: 'COMPLETED', doctorId: 'doc-1', scheduledStart: hourFromNow(-1) });
      await expect(service.transition(frontDesk, '11111111-1111-4111-8111-111111111111', 'CANCELLED')).rejects.toBeInstanceOf(ConflictException);
      prisma.appointment.findFirst.mockResolvedValue({ id: 'a', status: 'SCHEDULED', doctorId: 'doc-1', scheduledStart: hourFromNow(3) });
      await expect(service.transition(frontDesk, '11111111-1111-4111-8111-111111111111', 'NO_SHOW')).rejects.toThrow(/after its start time/);
    });

    it('delegates check-in to the queue service', async () => {
      const { service, prisma, queues } = setup();
      prisma.appointment.findFirst.mockResolvedValue({ id: 'a', status: 'SCHEDULED', doctorId: 'doc-1', scheduledStart: hourFromNow(1) });
      await service.transition(frontDesk, '11111111-1111-4111-8111-111111111111', 'CHECKED_IN');
      expect(queues.checkIn).toHaveBeenCalledWith(frontDesk, { appointmentId: '11111111-1111-4111-8111-111111111111' });
    });

    it('lets doctors change only their own appointments', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findFirst.mockResolvedValue({ id: 'a', status: 'SCHEDULED', doctorId: 'someone-else', scheduledStart: hourFromNow(1) });
      await expect(service.transition(doctorUser, '11111111-1111-4111-8111-111111111111', 'CONFIRMED')).rejects.toBeInstanceOf(ForbiddenException);
      prisma.appointment.findFirst.mockResolvedValue({ id: 'a', status: 'SCHEDULED', doctorId: 'doc-1', scheduledStart: hourFromNow(1) });
      await expect(service.transition(doctorUser, '11111111-1111-4111-8111-111111111111', 'CONFIRMED')).resolves.toBeDefined();
    });
  });

  describe('reads', () => {
    it('findOne is scoped to org + branch and 404s otherwise', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findFirst.mockResolvedValue(null);
      await expect(service.findOne(frontDesk, '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.appointment.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, branchId: BRANCH });
      await expect(service.findOne(frontDesk, 'bad-id')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('findAll applies a branch-timezone day window, filters and pagination', async () => {
      const { service, prisma } = setup();
      const res = await service.findAll(frontDesk, { date: '2030-01-10', doctorId: 'doc-1', status: 'SCHEDULED,CONFIRMED', page: 2, limit: 10 } as any);
      const args = prisma.appointment.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ organizationId: ORG, branchId: BRANCH, doctorId: 'doc-1', status: { in: ['SCHEDULED', 'CONFIRMED'] } });
      // 2030-01-10 00:00 Asia/Kolkata = 2030-01-09T18:30Z
      expect(args.where.scheduledStart.gte.toISOString()).toBe('2030-01-09T18:30:00.000Z');
      expect(args.where.scheduledStart.lt.toISOString()).toBe('2030-01-10T18:30:00.000Z');
      expect(args.skip).toBe(10);
      expect(res).toMatchObject({ page: 2, limit: 10, total: 0 });
    });

    it('excludes cancelled appointments by default and rejects unknown statuses', async () => {
      const { service, prisma } = setup();
      await service.findAll(frontDesk, {} as any);
      expect(prisma.appointment.findMany.mock.calls[0][0].where.status).toEqual({ not: 'CANCELLED' });
      await expect(service.findAll(frontDesk, { status: 'NOPE' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reschedule', () => {
    it('only reschedules SCHEDULED/CONFIRMED appointments', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findFirst.mockResolvedValueOnce({ id: 'a', status: 'CHECKED_IN', doctorId: 'doc-1' });
      await expect(service.reschedule(frontDesk, '11111111-1111-4111-8111-111111111111', dto())).rejects.toBeInstanceOf(ConflictException);
    });

    it('moves the appointment, excluding itself from the overlap check', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findFirst
        .mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111', status: 'CONFIRMED', doctorId: 'doc-1' })
        .mockResolvedValueOnce(null);
      const res = await service.reschedule(frontDesk, '11111111-1111-4111-8111-111111111111', dto(48));
      expect(prisma.appointment.findFirst.mock.calls[1][0].where.id).toEqual({ not: '11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe('SCHEDULED');
    });
  });
});
