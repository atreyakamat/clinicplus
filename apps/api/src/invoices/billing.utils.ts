import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';

export const D = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);
export const ZERO = new Prisma.Decimal(0);

/** Payment statuses that represent money actually collected (before refunds). */
export const COLLECTED_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

/** Statuses that still expect money. */
export const OPEN_STATUSES: InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'];

/** Currencies whose Stripe amounts have no minor unit. */
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export function toMinorUnits(amount: Prisma.Decimal, currency: string): number {
  const factor = ZERO_DECIMAL.has(currency.toLowerCase()) ? 1 : 100;
  return amount.mul(factor).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function fromMinorUnits(amount: number, currency: string): Prisma.Decimal {
  const factor = ZERO_DECIMAL.has(currency.toLowerCase()) ? 1 : 100;
  return new Prisma.Decimal(amount).div(factor).toDecimalPlaces(2);
}

/** Converts a validated JS number (max 2 dp) to a Decimal without float drift. */
export function moneyInput(v: number | string | undefined | null, field = 'amount'): Prisma.Decimal {
  if (v === undefined || v === null || v === '') return ZERO;
  const d = new Prisma.Decimal(String(v));
  if (d.isNaN() || !d.isFinite()) throw new BadRequestException(`${field} is not a valid amount`);
  if (d.lt(0)) throw new BadRequestException(`${field} cannot be negative`);
  if (d.decimalPlaces() > 2) throw new BadRequestException(`${field} may have at most 2 decimal places`);
  return d;
}

export interface LineInput {
  quantity: number;
  unitPrice: Prisma.Decimal;
}

export interface Totals {
  lines: Prisma.Decimal[];
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
}

/** total = Σ(qty × unitPrice) − discount + tax, all in exact decimal arithmetic. */
export function computeTotals(lines: LineInput[], discount: Prisma.Decimal, tax: Prisma.Decimal): Totals {
  const amounts = lines.map((l) => l.unitPrice.mul(l.quantity).toDecimalPlaces(2));
  const subtotal = amounts.reduce((s, a) => s.plus(a), ZERO);
  if (discount.gt(subtotal)) throw new BadRequestException('Discount cannot exceed the subtotal');
  const total = subtotal.minus(discount).plus(tax);
  return { lines: amounts, subtotal, discount, tax, total };
}

/**
 * Invoice status machine. VOID is terminal; DRAFT stays DRAFT until it is issued
 * or money arrives; otherwise the status follows the balance and due date.
 */
export function deriveStatus(
  current: InvoiceStatus,
  total: Prisma.Decimal,
  netPaid: Prisma.Decimal,
  dueDate: Date | null,
  now = new Date(),
): InvoiceStatus {
  if (current === 'VOID') return 'VOID';
  if (netPaid.gt(0) && netPaid.gte(total)) return 'PAID';
  if (current === 'DRAFT' && netPaid.lte(0)) return 'DRAFT';
  if (total.lte(0)) return 'PAID';
  const overdue = !!dueDate && dueDate.getTime() < now.getTime();
  if (overdue) return 'OVERDUE';
  return netPaid.gt(0) ? 'PARTIALLY_PAID' : 'SENT';
}
