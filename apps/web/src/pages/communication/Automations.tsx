import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { api } from '../../app/lib/api';
import { HasPermission } from '../../app/components/HasPermission';
import { Btn, ErrorNote, Loading, Panel, fmtDateTime, getData } from './shared';

const LABELS: Record<string, { title: string; desc: string }> = {
  bookingConfirmations: { title: 'Booking confirmation', desc: 'Sent shortly after an appointment is booked.' },
  cancellationNotices: { title: 'Cancellation notice', desc: 'Sent when an upcoming appointment is cancelled.' },
  reminders24h: { title: '24-hour reminder', desc: 'Sent the day before the appointment.' },
  reminders2h: { title: '2-hour reminder', desc: 'Sent shortly before the appointment.' },
  followUpsDue: { title: 'Follow-up due', desc: 'Sent when a recommended follow-up is due tomorrow.' },
  followUpsOverdue: { title: 'Follow-up overdue', desc: 'Up to 3 nudges, 3 days apart, for missed follow-ups.' },
  campaigns: { title: 'Campaign messages', desc: 'Scheduled and in-progress campaigns are sent in batches.' },
};

export const Automations = ({ provider }: { provider: any }) => {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['comm', 'automation-status'], queryFn: () => getData<any>('/messages/automations/status') });
  const run = useMutation({
    mutationFn: async () => (await api.post('/messages/automations/run', {}))?.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comm'] }),
  });

  if (status.isLoading) return <Loading />;
  if (status.error) return <ErrorNote error={status.error} />;
  const s = status.data;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-100">Scheduler</h3>
            {s?.schedulerActive ? (
              <p className="text-sm text-emerald-300">Running every {provider?.reminderIntervalMinutes ?? 15} minutes on this server.</p>
            ) : provider?.schedulerEnabled ? (
              <p className="text-sm text-gray-300">Enabled (SCHEDULER_ENABLED=true); another replica may hold the lock.</p>
            ) : (
              <p className="text-sm text-amber-300">
                Disabled (SCHEDULER_ENABLED=false). Reminders and scheduled campaigns only go out when you click "Run now".
              </p>
            )}
            {s?.lastScheduledRun && <p className="mt-1 text-xs text-gray-500">Last scheduled run: {fmtDateTime(s.lastScheduledRun.finishedAt)}</p>}
          </div>
          <HasPermission permission="campaigns.manage">
            <Btn disabled={run.isPending} onClick={() => run.mutate()}>
              <Play size={14} /> {run.isPending ? 'Running…' : 'Run now'}
            </Btn>
          </HasPermission>
        </div>
        <ErrorNote error={run.error} />
        {run.data && (
          <div className="mt-3 rounded-lg bg-gray-800/60 p-3 text-xs text-gray-300">
            <p className="mb-1 font-medium text-gray-200">Run finished {fmtDateTime(run.data.finishedAt)}</p>
            <ul className="space-y-0.5">
              {Object.entries(run.data.results ?? {}).map(([k, v]: [string, any]) => (
                <li key={k}>
                  {LABELS[k]?.title ?? k}:{' '}
                  {k === 'campaigns'
                    ? `${v.campaigns} campaign(s), ${v.sent} accepted, ${v.failed} not delivered`
                    : `${v.sent} accepted, ${v.failed} not delivered, ${v.skipped} already sent (of ${v.candidates})`}
                </li>
              ))}
            </ul>
            {run.data.errors?.length > 0 && <p className="mt-1 text-red-300">{run.data.errors.join('; ')}</p>}
          </div>
        )}
      </Panel>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(LABELS).map(([k, l]) => (
          <Panel key={k}>
            <p className="font-medium text-gray-100">{l.title}</p>
            <p className="mt-1 text-xs text-gray-400">{l.desc}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-100">{s?.last7Days?.[k] ?? 0}</p>
            <p className="text-[11px] text-gray-500">messages in the last 7 days (this branch)</p>
          </Panel>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Message text comes from the active template for each purpose (Templates tab). Each message is sent at most once per appointment / follow-up.
        Patients choose WhatsApp or SMS via their preferred channel; otherwise WhatsApp is used when configured.
      </p>
    </div>
  );
};
