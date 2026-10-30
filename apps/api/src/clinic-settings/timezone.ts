/**
 * Small, dependency-free timezone helpers (IANA zones via Intl).
 *
 * Scheduling data (working hours, doctor availability) is stored as local
 * wall-clock "HH:mm" strings per weekday; appointments are stored as UTC
 * instants. These helpers convert between the two in the branch timezone.
 * dayOfWeek follows JS: 0 = Sunday ... 6 = Saturday.
 */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parts(date: Date, tz: string) {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `tz` from UTC at the given instant, in minutes (e.g. +330 for Asia/Kolkata). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant of local wall-clock `date` (YYYY-MM-DD) + `time` (HH:mm) in `tz`. */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t);
}

/** Local calendar date, minutes since local midnight and weekday of an instant in `tz`. */
export function localInfo(date: Date, tz: string) {
  const p = parts(date, tz);
  const ymd = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return {
    date: ymd,
    minutes: p.hour * 60 + p.minute,
    time: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
    dayOfWeek: dayOfWeekOf(ymd),
  };
}

export function dayOfWeekOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Calendar date stored as a UTC-midnight DateTime (used for holidays). */
export function dateOnlyToUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isValidDateOnly(ymd: string): boolean {
  if (!DATE_RE.test(ymd)) return false;
  return dateOnlyToUtc(ymd).toISOString().slice(0, 10) === ymd;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
