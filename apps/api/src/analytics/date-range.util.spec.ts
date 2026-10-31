import { addDaysYmd, localYmd, pct, resolveRange, zonedDayStart } from './date-range.util';

describe('date-range utils', () => {
  it('converts a local day start to UTC (Asia/Kolkata, +05:30)', () => {
    expect(zonedDayStart('2026-03-10', 'Asia/Kolkata').toISOString()).toBe('2026-03-09T18:30:00.000Z');
  });

  it('handles DST transitions (America/New_York)', () => {
    expect(zonedDayStart('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(zonedDayStart('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('builds an inclusive range with an exclusive UTC end', () => {
    const r = resolveRange({ from: '2026-01-01', to: '2026-01-31' }, 'UTC');
    expect(r.days).toBe(31);
    expect(r.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('rejects inverted and malformed ranges', () => {
    expect(() => resolveRange({ from: '2026-02-01', to: '2026-01-01' }, 'UTC')).toThrow();
    expect(() => resolveRange({ from: '2026/01/01' }, 'UTC')).toThrow();
  });

  it('localYmd / addDaysYmd / pct', () => {
    expect(localYmd(new Date('2026-03-09T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-03-10');
    expect(addDaysYmd('2026-02-28', 1)).toBe('2026-03-01');
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 0)).toBeNull();
  });
});
