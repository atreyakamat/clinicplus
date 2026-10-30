import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import { LedgerService } from '../payments/ledger.service';
import { PaymentsService } from '../payments/payments.service';
import { addDaysYmd, resolveTimezone, zonedDayStart } from '../analytics/date-range.util';
import { D, OPEN_STATUSES, computeTotals, deriveStatus, moneyInput } from './billing.utils';
import { CreateInvoiceDto, InvoiceItemDto, ListInvoicesQueryDto, UpdateInvoiceDto, VoidInvoiceDto } from './dto/invoice.dto';

type Tx = Prisma.TransactionClient;

export interface Actor {
  id: string;
  organizationId: string;
  branchId: string;
}

const PATIENT_SUMMARY = { id: true, firstName: true, lastName: true, phone: true, patientCode: true } as const;

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAssertService,
    private readonly ledger: LedgerService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
  ) {}

  // ---------------------------------------------------------------- helpers

  /** Active catalog services the invoice form can pick from. */
  async catalog(organizationId: string) {
    return this.prisma.clinicService.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: { id: true, name: true, description: true, price: true, duration: true, departmentId: true },
      orderBy: { name: 'asc' },
    });
  }

  private async resolveItems(items: InvoiceItemDto[], organizationId: string, db: Tx | PrismaService) {
    const serviceIds = [...new Set(items.map((i) => i.serviceId).filter((x): x is string => !!x))];
    const services = serviceIds.length
      ? await db.clinicService.findMany({ where: { id: { in: serviceIds }, organizationId, status: 'ACTIVE' } })
      : [];
    const byId = new Map(services.map((s) => [s.id, s]));
    return items.map((item, idx) => {
      const service = item.serviceId ? byId.get(item.serviceId) : undefined;
      if (item.serviceId && !service) throw new NotFoundException(`Service on line ${idx + 1} not found`);
      const itemName = item.itemName?.trim() || service?.name;
      if (!itemName) throw new BadRequestException(`Line ${idx + 1} needs an itemName or a serviceId`);
      const unitPrice =
        item.unitPrice !== undefined && item.unitPrice !== null
          ? moneyInput(item.unitPrice, `items[${idx}].unitPrice`)
          : service
            ? D(service.price)
            : null;
      if (unitPrice === null) throw new BadRequestException(`Line ${idx + 1} needs a unitPrice`);
      return { serviceId: service?.id ?? null, itemName, quantity: item.quantity, unitPrice };
    });
  }

  private async assertAppointment(appointmentId: string, patientId: string, actor: Actor) {
    const appt = await this.tenant.appointment(appointmentId, actor.organizationId, actor.branchId);
    if (appt.patientId !== patientId) throw new BadRequestException('Appointment belongs to a different patient');
    return appt;
  }

  private async nextInvoiceNumber(tx: Tx, organizationId: string) {
    const prefix = `INV-${new Date().getUTCFullYear()}-`;
    // Serialise allocation per org until this transaction commits (see patients).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'invoice-number:' + organizationId}))`;
    const last = await tx.invoice.findFirst({
      where: { organizationId, invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const seq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) || 0 : 0;
    return `${prefix}${String(seq + 1).padStart(6, '0')}`;
  }

  private withBalance<T extends { id: string; total: Prisma.Decimal }>(inv: T, net: Prisma.Decimal) {
    const balance = inv.total.minus(net);
    return { ...inv, amountPaid: net.toFixed(2), balance: (balance.lt(0) ? D(0) : balance).toFixed(2) };
  }

  // ---------------------------------------------------------------- create / read

  async create(dto: CreateInvoiceDto, actor: Actor) {
    await this.tenant.patient(dto.patientId, actor.organizationId);
    if (dto.appointmentId) await this.assertAppointment(dto.appointmentId, dto.patientId, actor);
    const lines = await this.resolveItems(dto.items, actor.organizationId, this.prisma);
    const totals = computeTotals(lines, moneyInput(dto.discount, 'discount'), moneyInput(dto.tax, 'tax'));
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const status = dto.issue ? deriveStatus('SENT', totals.total, D(0), dueDate) : 'DRAFT';

    for (let attempt = 0; ; attempt++) {
      try {
        const invoice = await this.prisma.$transaction(async (tx) => {
          const invoiceNumber = await this.nextInvoiceNumber(tx, actor.organizationId);
          return tx.invoice.create({
            data: {
              organizationId: actor.organizationId,
              branchId: actor.branchId,
              patientId: dto.patientId,
              appointmentId: dto.appointmentId ?? null,
              invoiceNumber,
              subtotal: totals.subtotal,
              discount: totals.discount,
              tax: totals.tax,
              total: totals.total,
              status,
              notes: dto.notes?.trim() || null,
              dueDate,
              createdBy: actor.id,
              items: {
                create: lines.map((l, i) => ({
                  organizationId: actor.organizationId,
                  branchId: actor.branchId,
                  serviceId: l.serviceId,
                  itemName: l.itemName,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  amount: totals.lines[i],
                })),
              },
            },
            include: { items: true },
          });
        });
        await this.audit.log({
          organizationId: actor.organizationId,
          userId: actor.id,
          action: 'INVOICE_CREATED',
          resource: 'invoice',
          resourceId: invoice.id,
          afterData: { invoiceNumber: invoice.invoiceNumber, total: invoice.total.toFixed(2), status },
        });
        return this.withBalance(invoice, D(0));
      } catch (err) {
        if (isUniqueViolation(err) && attempt < 5) continue; // concurrent number allocation
        throw err;
      }
    }
  }

  async findAll(q: ListInvoicesQueryDto, organizationId: string, branchId: string) {
    await this.ledger.refreshOverdue(organizationId, branchId);
    const { page, limit, skip, take } = pageArgs(q);
    const where: Prisma.InvoiceWhereInput = { organizationId, branchId, deletedAt: null };
    if (q.status) where.status = q.status as any;
    if (q.outstanding && !q.status) where.status = { in: OPEN_STATUSES };
    if (q.patientId) where.patientId = q.patientId;
    if (q.from || q.to) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId }, select: { timezone: true } });
      const tz = resolveTimezone(branch?.timezone, process.env.DEFAULT_TIMEZONE);
      where.createdAt = {
        ...(q.from ? { gte: zonedDayStart(q.from, tz) } : {}),
        ...(q.to ? { lt: zonedDayStart(addDaysYmd(q.to, 1), tz) } : {}),
      };
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { invoiceNumber: { contains: s, mode: 'insensitive' } },
        { patient: { firstName: { contains: s, mode: 'insensitive' } } },
        { patient: { lastName: { contains: s, mode: 'insensitive' } } },
        { patient: { phone: { contains: s } } },
      ];
    }
    if (q.outstanding && q.status && !OPEN_STATUSES.includes(q.status as any)) {
      return paginated([], 0, page, limit);
    }
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { patient: { select: PATIENT_SUMMARY } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    const balances = await this.ledger.balances(rows.map((r) => r.id));
    return paginated(
      rows.map((r) => this.withBalance(r, balances.get(r.id)!.net)),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    assertUuid(id, 'invoiceId');
    let invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, branchId, deletedAt: null },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        patient: { select: { ...PATIENT_SUMMARY, email: true, gender: true } },
        payments: {
          orderBy: { createdAt: 'asc' },
          include: {
            refunds: { orderBy: { createdAt: 'asc' } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        branch: { select: { id: true, name: true, address: true, phone: true, email: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const { invoice: synced, balance } = await this.ledger.syncStatus(invoice);
    invoice = { ...invoice, status: synced.status };
    const appointment = invoice.appointmentId
      ? await this.prisma.appointment.findFirst({
          where: { id: invoice.appointmentId, organizationId },
          select: {
            id: true,
            scheduledStart: true,
            doctor: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      : null;
    return {
      ...this.withBalance(invoice, balance.net),
      refundedAmount: balance.refunded.toFixed(2),
      appointment,
    };
  }

  // ---------------------------------------------------------------- mutations

  async update(id: string, dto: UpdateInvoiceDto, actor: Actor) {
    assertUuid(id, 'invoiceId');
    let retire: { id: string; stripeCheckoutSessionId: string | null } | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const invoice = await this.ledger.lockInvoice(tx, id, actor.organizationId, actor.branchId);
      const { net } = await this.ledger.balance(invoice.id, tx);
      if (!['DRAFT', 'SENT', 'OVERDUE'].includes(invoice.status) || net.gt(0)) {
        throw new BadRequestException('Only draft or unpaid issued invoices can be edited');
      }
      if (dto.appointmentId) await this.assertAppointment(dto.appointmentId, invoice.patientId, actor);

      let lines: { serviceId: string | null; itemName: string; quantity: number; unitPrice: Prisma.Decimal }[];
      if (dto.items) {
        lines = await this.resolveItems(dto.items, actor.organizationId, tx);
      } else {
        const existing = await tx.invoiceItem.findMany({ where: { invoiceId: invoice.id }, orderBy: { createdAt: 'asc' } });
        lines = existing.map((e) => ({ serviceId: e.serviceId, itemName: e.itemName, quantity: e.quantity, unitPrice: e.unitPrice }));
      }
      const totals = computeTotals(
        lines,
        dto.discount !== undefined ? moneyInput(dto.discount, 'discount') : invoice.discount,
        dto.tax !== undefined ? moneyInput(dto.tax, 'tax') : invoice.tax,
      );
      if (dto.items) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
        await tx.invoiceItem.createMany({
          data: lines.map((l, i) => ({
            organizationId: invoice.organizationId,
            branchId: invoice.branchId,
            invoiceId: invoice.id,
            serviceId: l.serviceId,
            itemName: l.itemName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: totals.lines[i],
          })),
        });
      }
      const dueDate = dto.dueDate === undefined ? invoice.dueDate : dto.dueDate ? new Date(dto.dueDate) : null;
      const totalChanged = !totals.total.eq(invoice.total);
      if (totalChanged && invoice.stripeCheckoutSessionId && invoice.paymentLinkUrl) {
        retire = { id: invoice.id, stripeCheckoutSessionId: invoice.stripeCheckoutSessionId };
      }
      const status = deriveStatus(invoice.status === 'OVERDUE' ? 'SENT' : invoice.status, totals.total, net, dueDate);
      const row = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          dueDate,
          status,
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          ...(dto.appointmentId !== undefined ? { appointmentId: dto.appointmentId } : {}),
          updatedBy: actor.id,
        },
      });
      return { before: invoice, after: row };
    });
    if (retire) await this.payments.retireCheckoutSession(retire);
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'INVOICE_UPDATED',
      resource: 'invoice',
      resourceId: id,
      beforeData: { total: updated.before.total.toFixed(2), status: updated.before.status },
      afterData: { total: updated.after.total.toFixed(2), status: updated.after.status },
    });
    return this.findOne(id, actor.organizationId, actor.branchId);
  }

  /** DRAFT -> SENT (issue the invoice to the patient). */
  async markSent(id: string, actor: Actor) {
    assertUuid(id, 'invoiceId');
    await this.prisma.$transaction(async (tx) => {
      const invoice = await this.ledger.lockInvoice(tx, id, actor.organizationId, actor.branchId);
      if (invoice.status === 'VOID') throw new BadRequestException('A void invoice cannot be issued');
      if (invoice.status !== 'DRAFT') return;
      const { net } = await this.ledger.balance(invoice.id, tx);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: deriveStatus('SENT', invoice.total, net, invoice.dueDate), updatedBy: actor.id },
      });
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'INVOICE_SENT',
      resource: 'invoice',
      resourceId: id,
    });
    return this.findOne(id, actor.organizationId, actor.branchId);
  }

  async void(id: string, dto: VoidInvoiceDto, actor: Actor) {
    assertUuid(id, 'invoiceId');
    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoice = await this.ledger.lockInvoice(tx, id, actor.organizationId, actor.branchId);
      if (invoice.status === 'VOID') throw new BadRequestException('Invoice is already void');
      const { net } = await this.ledger.balance(invoice.id, tx);
      if (net.gt(0)) {
        throw new BadRequestException('Invoice has payments; refund them before voiding');
      }
      return tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'VOID', voidReason: dto.reason.trim(), updatedBy: actor.id },
      });
    });
    await this.payments.retireCheckoutSession(invoice);
    await this.timeline.record({
      organizationId: actor.organizationId,
      patientId: invoice.patientId,
      eventType: 'INVOICE_VOIDED',
      eventCategory: 'BILLING',
      title: 'Invoice voided',
      description: `${invoice.invoiceNumber}: ${dto.reason}`,
      createdBy: actor.id,
      metadata: { invoiceId: invoice.id },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'INVOICE_VOIDED',
      resource: 'invoice',
      resourceId: id,
      afterData: { reason: dto.reason },
    });
    return this.findOne(id, actor.organizationId, actor.branchId);
  }
}
