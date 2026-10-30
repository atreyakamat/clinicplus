import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, Copy } from 'lucide-react';
import { Button } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { type AvailabilityBlock, DAY_NAMES, errorMessage, inputCls } from './scheduling';

/** Weekly schedule editor: several time blocks per weekday, saved with PUT /doctors/:id/availability. */
export const AvailabilityEditor = ({
  doctorId,
  initial,
  editable,
  onSaved,
}: {
  doctorId: string;
  initial: AvailabilityBlock[];
  editable: boolean;
  onSaved?: (blocks: AvailabilityBlock[]) => void;
}) => {
  const qc = useQueryClient();
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setBlocks(initial), [initial]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/doctors/${doctorId}/availability`, {
        blocks: blocks.map(({ dayOfWeek, startTime, endTime, slotDuration }) => ({ dayOfWeek, startTime, endTime, slotDuration: Number(slotDuration) })),
      });
      return res?.data as AvailabilityBlock[];
    },
    onSuccess: (saved) => {
      setMsg({ ok: true, text: 'Schedule saved' });
      qc.invalidateQueries({ queryKey: ['doctor', doctorId] });
      qc.invalidateQueries({ queryKey: ['doctors'] });
      qc.invalidateQueries({ queryKey: ['slots'] });
      onSaved?.(saved);
    },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });

  const add = (day: number) => {
    const last = blocks.filter((b) => b.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime)).pop();
    const start = last ? last.endTime : '09:00';
    const [h] = start.split(':').map(Number);
    const end = `${String(Math.min(h + 4, 23)).padStart(2, '0')}:00`;
    setBlocks([...blocks, { dayOfWeek: day, startTime: start, endTime: end > start ? end : '23:59', slotDuration: last?.slotDuration ?? 15 }]);
  };
  const update = (idx: number, patch: Partial<AvailabilityBlock>) => setBlocks(blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  const remove = (idx: number) => setBlocks(blocks.filter((_, i) => i !== idx));
  const copyToWeekdays = (day: number) => {
    const source = blocks.filter((b) => b.dayOfWeek === day);
    const others = blocks.filter((b) => b.dayOfWeek === day || ![1, 2, 3, 4, 5, 6].includes(b.dayOfWeek));
    const copies = [1, 2, 3, 4, 5, 6].filter((d) => d !== day).flatMap((d) => source.map((s) => ({ ...s, id: undefined, dayOfWeek: d })));
    setBlocks([...others, ...copies]);
  };

  return (
    <div className="space-y-3">
      {DAY_NAMES.map((name, day) => {
        const dayBlocks = blocks.map((b, idx) => ({ b, idx })).filter(({ b }) => b.dayOfWeek === day);
        return (
          <div key={day} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-sm">{name}</div>
              {editable && (
                <div className="flex gap-1">
                  {dayBlocks.length > 0 && (
                    <button type="button" className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 px-2 py-1" onClick={() => copyToWeekdays(day)} title="Copy to Mon–Sat">
                      <Copy size={12} /> Copy to Mon–Sat
                    </button>
                  )}
                  <button type="button" className="text-xs text-[#1FA971] flex items-center gap-1 px-2 py-1" onClick={() => add(day)}><Plus size={12} /> Add hours</button>
                </div>
              )}
            </div>
            {dayBlocks.length === 0 ? (
              <p className="text-xs text-slate-400 mt-1">Not available</p>
            ) : (
              <div className="mt-2 space-y-2">
                {dayBlocks.map(({ b, idx }) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="time" disabled={!editable} className={`${inputCls} w-32`} value={b.startTime} onChange={(e) => update(idx, { startTime: e.target.value })} />
                    <span>–</span>
                    <input type="time" disabled={!editable} className={`${inputCls} w-32`} value={b.endTime} onChange={(e) => update(idx, { endTime: e.target.value })} />
                    <select disabled={!editable} className={`${inputCls} w-36`} value={b.slotDuration} onChange={(e) => update(idx, { slotDuration: Number(e.target.value) })}>
                      {[5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min slots</option>)}
                    </select>
                    {editable && <button type="button" className="p-1 text-slate-400 hover:text-red-600" onClick={() => remove(idx)} title="Remove"><Trash2 size={16} /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {msg && <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
      {editable && (
        <Button className="gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save size={16} /> {save.isPending ? 'Saving…' : 'Save weekly schedule'}
        </Button>
      )}
    </div>
  );
};
