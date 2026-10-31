import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Btn, Empty, ErrorNote, Loading, Panel, StatusBadge, fmtDateTime, getData, getPage, inputCls, patientName } from './shared';

const STATUSES = ['', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNDELIVERED', 'NOT_SENT_CONSOLE', 'RECEIVED', 'PENDING'];

export const DeliveryLog = () => {
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [source, setSource] = useState('');
  const [direction, setDirection] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), limit: '50' });
  if (status) qs.set('status', status);
  if (channel) qs.set('channel', channel);
  if (source) qs.set('source', source);
  if (direction) qs.set('direction', direction);

  const log = useQuery({ queryKey: ['comm', 'log', qs.toString()], queryFn: () => getPage(`/messages?${qs.toString()}`) });
  const stats = useQuery({ queryKey: ['comm', 'stats'], queryFn: () => getData<any>('/messages/stats') });

  const totals: Record<string, number> = {};
  (stats.data?.rows ?? []).forEach((r: any) => {
    const k = r.deliveryStatus ?? 'UNKNOWN';
    totals[k] = (totals[k] ?? 0) + r.count;
  });

  const reset = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    fn(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {Object.keys(totals).length > 0 && (
        <Panel>
          <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Last 30 days</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(totals).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 text-sm text-gray-200">
                <StatusBadge status={k} /> {v}
              </span>
            ))}
          </div>
        </Panel>
      )}
      <Panel>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select className={inputCls} value={status} onChange={reset(setStatus)} aria-label="Status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s ? s.replace(/_/g, ' ') : 'All statuses'}
              </option>
            ))}
          </select>
          <select className={inputCls} value={channel} onChange={reset(setChannel)} aria-label="Channel">
            <option value="">All channels</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="SMS">SMS</option>
          </select>
          <select className={inputCls} value={direction} onChange={reset(setDirection)} aria-label="Direction">
            <option value="">In + out</option>
            <option value="OUTBOUND">Outbound</option>
            <option value="INBOUND">Inbound</option>
          </select>
          <select className={inputCls} value={source} onChange={reset(setSource)} aria-label="Source">
            <option value="">All sources</option>
            <option value="manual">Staff messages</option>
            <option value="automation">Automations</option>
            <option value="campaign">Campaigns</option>
          </select>
        </div>
        {log.isLoading ? (
          <Loading />
        ) : log.error ? (
          <ErrorNote error={log.error} />
        ) : !log.data?.items.length ? (
          <Empty>No messages match these filters.</Empty>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Patient</th>
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2 pr-3">Message</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {log.data.items.map((m: any) => (
                    <tr key={m.id} className="align-top">
                      <td className="py-2 pr-3 text-xs text-gray-400 whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
                      <td className="py-2 pr-3 text-gray-200">
                        {patientName(m.patient)}
                        <div className="text-xs text-gray-500">{m.patient?.phone}</div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-300">
                        {m.channel}
                        <div className="text-gray-500">{m.direction === 'INBOUND' ? 'inbound' : m.reminderKey ? (m.reminderKey.startsWith('campaign:') ? 'campaign' : 'automation') : 'staff'}</div>
                      </td>
                      <td className="max-w-xs py-2 pr-3 text-gray-300">
                        <p className="line-clamp-2 break-words">{m.messageBody}</p>
                        {m.errorMessage && m.deliveryStatus !== 'NOT_SENT_CONSOLE' && <p className="mt-1 text-xs text-red-300">{m.errorMessage}</p>}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={m.deliveryStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
              <span>
                {log.data.total} message(s) · page {log.data.page} of {log.data.pages}
              </span>
              <div className="flex gap-2">
                <Btn variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Btn>
                <Btn variant="ghost" disabled={page >= log.data.pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Btn>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
};
