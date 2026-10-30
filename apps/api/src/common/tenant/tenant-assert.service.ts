import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertUuid } from '../validation/uuid';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Verifies that client-supplied foreign keys belong to the caller's tenant.
 * Every lookup is scoped by organizationId (and branchId where supplied), and a
 * miss is reported as 404 so that ids from other tenants are indistinguishable
 * from non-existent ones.
 */
@Injectable()
export class TenantAssertService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Db): Db {
    return tx ?? this.prisma;
  }

  async patient(id: string, organizationId: string, branchId?: string, tx?: Db) {
    assertUuid(id, 'patientId');
    const row = await this.db(tx).patient.findFirst({
      where: { id, organizationId, ...(branchId ? { branchId } : {}), status: { not: 'ARCHIVED' } },
    });
    if (!row) throw new NotFoundException('Patient not found');
    return row;
  }

  /** A staff user of the organization (optionally restricted to a role name such as "Doctor"). */
  async user(id: string, organizationId: string, opts?: { role?: string; label?: string }, tx?: Db) {
    assertUuid(id, opts?.label ?? 'userId');
    const row = await this.db(tx).user.findFirst({
      where: {
        id,
        organizationId,
        status: 'ACTIVE',
        ...(opts?.role ? { roles: { some: { role: { name: opts.role } } } } : {}),
      },
      select: { id: true, organizationId: true, branchId: true, firstName: true, lastName: true },
    });
    if (!row) throw new NotFoundException(`${opts?.label ?? 'User'} not found`);
    return row;
  }

  async doctor(id: string, organizationId: string, tx?: Db) {
    return this.user(id, organizationId, { label: 'Doctor' }, tx);
  }

  async appointment(id: string, organizationId: string, branchId?: string, tx?: Db) {
    assertUuid(id, 'appointmentId');
    const row = await this.db(tx).appointment.findFirst({
      where: { id, organizationId, ...(branchId ? { branchId } : {}) },
    });
    if (!row) throw new NotFoundException('Appointment not found');
    return row;
  }

  async consultation(id: string, organizationId: string, branchId?: string, tx?: Db) {
    assertUuid(id, 'consultationId');
    const row = await this.db(tx).consultation.findFirst({
      where: { id, organizationId, ...(branchId ? { branchId } : {}) },
    });
    if (!row) throw new NotFoundException('Consultation not found');
    return row;
  }

  async invoice(id: string, organizationId: string, branchId?: string, tx?: Db) {
    assertUuid(id, 'invoiceId');
    const row = await this.db(tx).invoice.findFirst({
      where: { id, organizationId, ...(branchId ? { branchId } : {}) },
    });
    if (!row) throw new NotFoundException('Invoice not found');
    return row;
  }

  async role(id: string, organizationId: string, tx?: Db) {
    assertUuid(id, 'roleId');
    const row = await this.db(tx).role.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Role not found');
    return row;
  }

  async branch(id: string, organizationId: string, tx?: Db) {
    assertUuid(id, 'branchId');
    const row = await this.db(tx).branch.findFirst({ where: { id, organizationId, status: 'ACTIVE' } });
    if (!row) throw new NotFoundException('Branch not found');
    return row;
  }
}
