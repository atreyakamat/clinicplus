/** Shared helpers for the scheduling pages (doctors, appointments, queue, clinic setup). */
import { ApiError } from '../../app/lib/api';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Unwraps the API's `{ data, meta }` envelope. */
export function unwrap<T>(res: any): T {
  return (res && typeof res === 'object' && 'data' in res ? res.data : res) as T;
}

export function unwrapPage<T>(res: any): { items: T[]; total: number; page: number; limit: number } {
  return {
    items: (res?.data ?? []) as T[],
    total: res?.meta?.total ?? (res?.data?.length || 0),
    page: res?.meta?.page ?? 1,
    limit: res?.meta?.limit ?? 50,
  };
}

/** Human-readable message from an API error (class-validator arrays included). */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof ApiError) {
    const m = e.data?.message;
    if (Array.isArray(m)) return m.join('; ');
    if (typeof m === 'string' && m) return m;
    return e.message || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

/** YYYY-MM-DD of an instant in the given (or browser) timezone. */
export function ymd(date: Date = new Date(), timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function addDaysYmd(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function fmtTime(iso: string | Date, timeZone?: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone });
}

export function fmtDate(iso: string | Date, timeZone?: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone });
}

export function fmtDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function doctorName(d?: { firstName?: string; lastName?: string } | null) {
  return d ? `Dr. ${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() : '';
}

export function personName(p?: { firstName?: string; lastName?: string } | null) {
  return p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '';
}

export const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
  CONFIRMED: 'bg-purple-50 text-purple-700 border-purple-200',
  CHECKED_IN: 'bg-orange-50 text-orange-700 border-orange-200',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  NO_SHOW: 'bg-gray-100 text-gray-700 border-gray-200',
};

export const statusLabel = (s: string) => s.replace(/_/g, ' ');

export interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string | null;
  qualification?: string | null;
  specialization?: string | null;
  registrationNumber?: string | null;
  experienceYears?: number | null;
  bio?: string | null;
  consultationFee?: string | number | null;
  signatureUrl?: string | null;
  doctorAvailability?: AvailabilityBlock[];
}

export interface AvailabilityBlock {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
}

export interface Slot {
  start: string;
  end: string;
  time: string;
  available: boolean;
  reason?: 'past' | 'booked' | 'leave';
}

export interface DaySlots {
  date: string;
  timezone: string;
  closed: boolean;
  reason?: string;
  slots: Slot[];
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  appointmentType?: string | null;
  appointmentSource?: string | null;
  notes?: string | null;
  cancellationReason?: string | null;
  patient?: { id: string; firstName: string; lastName: string; phone?: string | null; patientCode?: string | null };
  doctor?: { id: string; firstName: string; lastName: string; specialization?: string | null };
}

export const inputCls =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]';
