import { Prisma } from '@prisma/client';
import { computeTotals, deriveStatus, fromMinorUnits, moneyInput, toMinorUnits } from './billing.utils';

const D = (v: string | number) => new Prisma.Decimal(v);

describe('billing utils', () => {
  it('computes totals with exact decimal arithmetic', () => {
    const t = computeTotals(
      [
        { quantity: 3, unitPrice: D('0.10') },
        { quantity: 1, unitPrice: D('0.20') },
        { quantity: 2, unitPrice: D('1499.99') },
      ],
      D('0.30'),
      D('18.05'),
    );
    expect(t.subtotal.toFixed(2)).toBe('3000.48');
    expect(t.total.toFixed(2)).toBe('3018.23');
    expect(t.lines.map((l) => l.toFixed(2))).toEqual(['0.30', '0.20', '2999.98']);
  });

  it('rejects a discount larger than the subtotal', () => {
    expect(() => computeTotals([{ quantity: 1, unitPrice: D(100) }], D(101), D(0))).toThrow();
  });

  it('validates money input', () => {
    expect(moneyInput(0.1).plus(moneyInput(0.2)).toString()).toBe('0.3');
    expect(() => moneyInput(-1)).toThrow();
    expect(() => moneyInput(1.234)).toThrow();
  });

  it('derives the invoice status', () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(deriveStatus('DRAFT', D(100), D(0), null)).toBe('DRAFT');
    expect(deriveStatus('DRAFT', D(100), D(40), null)).toBe('PARTIALLY_PAID');
    expect(deriveStatus('SENT', D(100), D(100), null)).toBe('PAID');
    expect(deriveStatus('PAID', D(100), D(0), null)).toBe('SENT');
    expect(deriveStatus('SENT', D(100), D(0), past)).toBe('OVERDUE');
    expect(deriveStatus('VOID', D(100), D(100), null)).toBe('VOID');
  });

  it('converts to and from Stripe minor units', () => {
    expect(toMinorUnits(D('1234.56'), 'inr')).toBe(123456);
    expect(toMinorUnits(D('500'), 'jpy')).toBe(500);
    expect(fromMinorUnits(123456, 'usd').toFixed(2)).toBe('1234.56');
  });
});
