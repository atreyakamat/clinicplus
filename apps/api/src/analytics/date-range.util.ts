import { BadRequestException } from '@nestjs/common';

/**
 * Timezone-aware date helpers shared by analytics and financial reports.
 *
 * Timestamps are stored as UTC (`timestamp(3)` without zone). Clinic users think in
 * their branch's local calendar days, so a "day" or a "from/to" range given as
 * YYYY-MM-DD is converted to the UTC instants that bound it in that timezone.
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isValidTimezone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimezone(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) if (isValidTimezone(c)) return c;
  return 'UTC';
}

/** Offset (ms) of `tz` relative to UTC at the given instant (positive east of UTC). */
export function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const m: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = Number(p.value);
  const asUtc = Date.UTC(m.year, m.month - 1, m.day, m.hour % 24, m.minute, m.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight at the start of `ymd` in `tz`. */
export function zonedDayStart(ymd: string, tz: string): Date {
  if (!YMD_RE.test(ymd)) throw new BadRequestException(`Invalid date "${ymd}", expected YYYY-MM-DD`);
  const [y, mo, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d);
  if (Number.isNaN(guess)) throw new BadRequestException(`Invalid date "${ymd}"`);
  const off1 = tzOffsetMs(new Date(guess), tz);
  let t = guess - off1;
  const off2 = tzOffsetMs(new Date(t), tz);
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

/** Local calendar date (YYYY-MM-DD) of an instant in `tz`. */
export function localYmd(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface ResolvedRange {
  /** Inclusive local start date. */
  from: string;
  /** Inclusive local end date. */
  to: string;
  tz: string;
  /** UTC instant of the start (inclusive). */
  start: Date;
  /** UTC instant of the end (exclusive) = local midnight after `to`. */
  end: Date;
  days: number;
}

/**
 * Resolves an inclusive local date range. Defaults to the last `defaultDays`
 * days ending today (local). Ranges longer than `maxDays` are rejected.
 */
export function resolveRange(
  q: { from?: string; to?: string },
  tz: string,
  defaultDays = 30,
  maxDays = 731,
): ResolvedRange {
  const today = localYmd(new Date(), tz);
  const to = q.to || today;
  const from = q.from || addDaysYmd(to, -(defaultDays - 1));
  const start = zonedDayStart(from, tz);
  const end = zonedDayStart(addDaysYmd(to, 1), tz);
  if (end <= start) throw new BadRequestException('"from" must be on or before "to"');
  const days = Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
    Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / DAY_MS) + 1;
  if (days > maxDays) throw new BadRequestException(`Date range too long (max ${maxDays} days)`);
  return { from, to, tz, start, end, days };
}

/** Today's bounds in `tz`. */
export function todayRange(tz: string): ResolvedRange {
  const today = localYmd(new Date(), tz);
  return resolveRange({ from: today, to: today }, tz);
}

/** Percentage rounded to one decimal; null when the denominator is zero. */
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
