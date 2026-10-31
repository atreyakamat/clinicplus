import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../app/lib/api';
import { type DaySlots, type Slot, addDaysYmd, errorMessage, fmtDay, inputCls, unwrap } from '../doctors/scheduling';

const REASON_LABEL: Record<string, string> = { past: 'Past', booked: 'Booked', leave: 'On leave' };

/** Real slot picker backed by GET /doctors/:id/slots (branch timezone, availability, leave, holidays, bookings). */
export const SlotPicker = ({
  doctorId,
  date,
  onDateChange,
  value,
  onSelect,
  duration,
  excludeAppointmentId,
}: {
  doctorId: string;
  date: string;
  onDateChange: (d: string) => void;
  value?: string;
  onSelect?: (slot: Slot, day: DaySlots) => void;
  duration?: number;
  excludeAppointmentId?: string;
}) => {
  const qs = new URLSearchParams({ date });
  if (duration) qs.set('duration', String(duration));
  if (excludeAppointmentId) qs.set('excludeAppointmentId', excludeAppointmentId);
  const { data, isLoading, error } = useQuery<DaySlots>({
    queryKey: ['slots', doctorId, date, duration ?? null, excludeAppointmentId ?? null],
    enabled: !!doctorId && !!date,
    queryFn: async () => unwrap<DaySlots>(await api.get(`/doctors/${doctorId}/slots?${qs.toString()}`)),
  });

  const available = data?.slots.filter((s) => s.available).length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="h-10 w-10 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50" onClick={() => onDateChange(addDaysYmd(date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
        <input type="date" className={`${inputCls} max-w-[180px]`} value={date} onChange={(e) => e.target.value && onDateChange(e.target.value)} />
        <button type="button" className="h-10 w-10 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50" onClick={() => onDateChange(addDaysYmd(date, 1))} aria-label="Next day"><ChevronRight size={16} /></button>
        <span className="text-sm text-slate-500 hidden sm:inline">{fmtDay(date)}</span>
      </div>
      {!doctorId ? (
        <p className="text-sm text-slate-500">Select a doctor to see open slots.</p>
      ) : isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}</div>
      ) : error ? (
        <p className="text-sm text-red-600">{errorMessage(error, 'Could not load slots')}</p>
      ) : !data ? null : data.closed ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">{data.reason ?? 'Closed'}</p>
      ) : data.slots.length === 0 ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">{data.reason ?? 'No slots on this day.'} Set a weekly schedule on the doctor's profile.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">{available} open slot(s) · times in {data.timezone}{data.reason ? ` · ${data.reason}` : ''}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
            {data.slots.map((s) => {
              const selected = value === s.start;
              return (
                <button
                  type="button"
                  key={s.start}
                  disabled={!s.available || !onSelect}
                  title={s.reason ? REASON_LABEL[s.reason] : 'Available'}
                  onClick={() => onSelect?.(s, data)}
                  className={`h-10 rounded-lg border text-sm font-medium transition ${
                    selected
                      ? 'bg-[#1FA971] border-[#1FA971] text-white'
                      : s.available
                        ? `border-[#1FA971]/40 text-[#137a52] bg-[#1FA971]/5 ${onSelect ? 'hover:bg-[#1FA971]/15' : ''}`
                        : 'border-slate-200 bg-slate-50 text-slate-400 line-through cursor-not-allowed'
                  }`}
                >
                  {s.time}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
