import { Injectable, NotFoundException } from '@nestjs/common';
import { Invoice, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COLLECTED_STATUSES, D, ZERO, deriveStatus } from '../invoices/billing.utils';

type Db = PrismaService | Prisma.TransactionClient;

export interface Balance {
  paid: Prisma.Decimal;
  refunded: Prisma.Decimal;
  net: Prisma.Decimal;
}

/**
 * Single source of truth for "how much has been paid on an invoice".
 *
 *   net paid = Σ collected payments (PAID / PARTIALLY_REFUNDED / REFUNDED, not refund rows)
 *            − Σ refunds (Refund rows not FAILED)
 *            − Σ legacy refund payment rows (isRefund = true)
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async balances(invoiceIds: string[], db: Db = this.prisma): Promise<Map<string, Balance>> {
    const out = new Map<string, Balance>();
    for (const id of invoiceIds) out.set(id, { paid: ZERO, refunded: ZERO, net: ZERO });
    if (!invoiceIds.length) return out;

    const [collected, legacyRefunds, refunds] = await Promise.all([
      db.payment.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { in: invoiceIds }, isRefund: false, paymentStatus: { in: [...COLLECTED_STATUSES] } },
        _sum: { amount: true },
      }),
      db.payment.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { in: invoiceIds }, isRefund: true },
        _sum: { amount: true },
      }),
      db.refund.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { in: invoiceIds }, OR: [{ status: null }, { status: { not: 'FAILED' } }] },
        _sum: { amount: true },
      }),
    ]);
    for (const row of collected) out.get(row.invoiceId)!.paid = D(row._sum.amount);
    for (const row of legacyRefunds) {
      const b = out.get(row.invoiceId)!;
      b.refunded = b.refunded.plus(D(row._sum.amount));
    }
    for (const row of refunds) {
      if (!row.invoiceId) continue;
      const b = out.get(row.invoiceId);
      if (b) b.refunded = b.refunded.plus(D(row._sum.amount));
    }
    for (const b of out.values()) b.net = b.paid.minus(b.refunded);
    return out;
  }

  async balance(invoiceId: string, db: Db = this.prisma): Promise<Balance> {
    return (await this.balances([invoiceId], db)).get(invoiceId)!;
  }

  /** Total refunded (not failed) against one payment. */
  async refundedForPayment(paymentId: string, db: Db = this.prisma): Promise<Prisma.Decimal> {
    const agg = await db.refund.aggregate({
      where: { paymentId, OR: [{ status: null }, { status: { not: 'FAILED' } }] },
      _sum: { amount: true },
    });
    return D(agg._sum.amount);
  }

  /** Row-locks the invoice for the rest of the transaction (serialises payments/refunds). */
  async lockInvoice(tx: Prisma.TransactionClient, invoiceId: string, organizationId: string, branchId?: string | null) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, organizationId, ...(branchId ? { branchId } : {}), deletedAt: null },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  /** Re-derives the invoice status from its balance and persists it if it changed. */
  async syncStatus(invoice: Invoice, db: Db = this.prisma): Promise<{ invoice: Invoice; balance: Balance }> {
    const balance = await this.balance(invoice.id, db);
    const status = deriveStatus(invoice.status, invoice.total, balance.net, invoice.dueDate);
    if (status !== invoice.status) {
      invoice = await db.invoice.update({ where: { id: invoice.id }, data: { status } });
    }
    return { invoice, balance };
  }

  /** Keeps a payment's status in line with how much of it has been refunded. */
  async syncPaymentRefundStatus(paymentId: string, db: Db = this.prisma) {
    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.isRefund || !COLLECTED_STATUSES.includes(payment.paymentStatus as any)) return;
    const refunded = await this.refundedForPayment(paymentId, db);
    const status = refunded.lte(0) ? 'PAID' : refunded.gte(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    if (status !== payment.paymentStatus) {
      await db.payment.update({ where: { id: paymentId }, data: { paymentStatus: status } });
    }
  }

  /**
   * Marks issued invoices whose due date has passed as OVERDUE. Cheap indexed
   * update, run before listings/reports so the status filter is always current.
   */
  async refreshOverdue(organizationId: string, branchId?: string | null) {
    await this.prisma.invoice.updateMany({
      where: {
        organizationId,
        ...(branchId ? { branchId } : {}),
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: new Date() },
        deletedAt: null,
      },
      data: { status: 'OVERDUE' },
    });
  }
}
