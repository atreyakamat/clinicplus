import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FollowUpsService } from './follow-ups.service';
import { FOLLOW_UP_TRANSITIONS, normalizeFollowUpStatus } from './follow-up.constants';

const ORG = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const ME = '33333333-3333-4333-8333-333333333333';
const FU = '55555555-5555-4555-8555-555555555555';
const PATIENT = '66666666-6666-4666-8666-666666666666';
const actor = { id: ME, organizationId: ORG, branchId: BRANCH };

function setup(existing: Record<string, unknown> | null = null) {
  const row = existing && {
    id: FU,
    organizationId: ORG,
    branchId: BRANCH,
    patientId: PATIENT,
    doctorId: ME,
    appointmentId: null,
    scheduledDate: new Date(Date.now() + 86400000),
    reason: null,
    patient: { id: PATIENT, firstName: 'A', lastName: 'B', phone: '9' },
    outcomes: [],
    ...existing,
  };
  const prisma = {
    followUp: {
      create: jest.fn(async ({ data }) => ({ id: FU, ...data })),
      findFirst: jest.fn(async () => row),
      update: jest.fn(async () => row),
    },
    followUpOutcome: { create: jest.fn(async ({ data }) => ({ id: 'o1', ...data })) },
    appointment: { findFirst: jest.fn() },
  };
  const tenant = {
    patient: jest.fn(async (id) => ({ id })),
    user: jest.fn(async (id) => ({ id })),
    appointment: jest.fn(),
    consultation: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const timeline = { record: jest.fn() };
  const automation = { ensureMissedFollowUpTask: jest.fn() };
  const service = new FollowUpsService(prisma as any, tenant as any, audit as any, timeline as any, automation as any);
  return { service, prisma, tenant, audit, timeline, automation };
}

describe('follow-up status rules', () => {
  it('treats unknown / legacy NULL status as PENDING', () => {
    expect(normalizeFollowUpStatus(null)).toBe('PENDING');
    expect(normalizeFollowUpStatus('weird')).toBe('PENDING');
    expect(normalizeFollowUpStatus('MISSED')).toBe('MISSED');
  });

  it('COMPLETED is terminal', () => {
    expect(FOLLOW_UP_TRANSITIONS.COMPLETED).toEqual([]);
  });
});

describe('FollowUpsService', () => {
  it('creates a PENDING follow-up scoped to the caller tenant, doctor defaulting to the caller', async () => {
    const { service, prisma, tenant } = setup({});
    await service.create({ patientId: PATIENT, scheduledDate: '2026-12-01T10:00:00.000Z', reason: 'Review' }, actor);
    expect(tenant.patient).toHaveBeenCalledWith(PATIENT, ORG);
    expect(prisma.followUp.create.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG,
      branchId: BRANCH,
      doctorId: ME,
      status: 'PENDING',
      reason: 'Review',
    });
  });

  it('404s for follow-ups outside the tenant/branch', async () => {
    const { service, prisma } = setup(null);
    await expect(service.findOne(FU, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.followUp.findFirst.mock.calls[0][0].where).toEqual({ id: FU, organizationId: ORG, branchId: BRANCH });
  });

  it('rejects invalid transitions', async () => {
    const { service, prisma } = setup({ status: 'COMPLETED' });
    await expect(service.updateStatus(FU, 'PENDING', actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.followUp.update).not.toHaveBeenCalled();
  });

  it('creates a front-desk task when a follow-up is marked MISSED', async () => {
    const { service, automation, audit } = setup({ status: 'PENDING' });
    await service.updateStatus(FU, 'MISSED', actor);
    expect(automation.ensureMissedFollowUpTask).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FOLLOW_UP_STATUS_CHANGED' }));
  });

  it('re-opens a missed follow-up when rescheduled and resets reminders', async () => {
    const { service, prisma } = setup({ status: 'MISSED' });
    await service.update(FU, { scheduledDate: '2026-12-05T10:00:00.000Z' }, actor);
    expect(prisma.followUp.update.mock.calls[0][0].data).toMatchObject({
      status: 'PENDING',
      reminderCount: 0,
      lastRemindedAt: null,
    });
  });

  it('records an outcome and optionally completes the follow-up', async () => {
    const { service, prisma } = setup({ status: 'PENDING' });
    await service.addOutcome(FU, { outcomeType: 'RECOVERED', remarks: 'ok', complete: true }, actor);
    expect(prisma.followUpOutcome.create.mock.calls[0][0].data).toMatchObject({
      followUpId: FU,
      organizationId: ORG,
      branchId: BRANCH,
      outcomeType: 'RECOVERED',
    });
    expect(prisma.followUp.update).toHaveBeenCalledWith({ where: { id: FU }, data: { status: 'COMPLETED' } });
  });
});
