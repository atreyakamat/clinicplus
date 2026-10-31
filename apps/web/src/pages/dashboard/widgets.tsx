import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@clinicplus/ui';
import { formatMoney } from '../billing/shared';

const time = (v: string) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const STATUS_TONE: Record<string, string> = {
  SCHEDULED: 'text-slate-500',
  CONFIRMED: 'text-blue-600',
  CHECKED_IN: 'text-amber-600',
  IN_PROGRESS: 'text-amber-700',
  COMPLETED: 'text-emerald-600',
  NO_SHOW: 'text-red-600',
  CANCELLED: 'text-slate-400 line-through',
};

/** Today's appointment list from GET /analytics/today or /analytics/doctor/me. */
export const AppointmentBoard = ({ list, showDoctor = true, title = 'Appointments today' }: { list?: any[]; showDoctor?: boolean; title?: string }) => (
  <Card className="p-5">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <Link to="/appointments" className="text-sm font-medium text-[#1FA971]">Open schedule</Link>
    </div>
    {!list ? (
      <p className="text-sm text-slate-500">Not available for your role.</p>
    ) : !list.length ? (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No appointments today.</div>
    ) : (
      <ul className="divide-y divide-slate-100">
        {list.slice(0, 12).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <Link to={`/patients/${a.patient?.id}`} className="truncate font-medium text-slate-900 hover:underline">
                {a.patient?.firstName} {a.patient?.lastName}
              </Link>
              <div className="text-xs text-slate-500">
                {time(a.scheduledStart)}
                {showDoctor && a.doctor ? ` · Dr. ${a.doctor.lastName}` : ''}
                {a.appointmentType ? ` · ${a.appointmentType}` : ''}
              </div>
            </div>
            <span className={`text-xs font-semibold uppercase ${STATUS_TONE[a.status] ?? 'text-slate-500'}`}>{a.status.replace('_', ' ')}</span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

export const CollectionsCard = ({ collections, currency }: { collections?: { total: string; byMethod: any[] }; currency: string }) =>
  collections ? (
    <Card className="p-5">
      <h3 className="font-semibold text-slate-900">Collected today</h3>
      <p className="mt-1 text-2xl font-semibold text-emerald-600">{formatMoney(collections.total, currency)}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {collections.byMethod.length ? (
          collections.byMethod.map((m: any) => (
            <li key={m.method} className="flex justify-between text-slate-600">
              <span>{m.method.replace('_', ' ')} ({m.count})</span>
              <span>{formatMoney(m.amount, currency)}</span>
            </li>
          ))
        ) : (
          <li className="text-slate-400">No payments yet today.</li>
        )}
      </ul>
    </Card>
  ) : null;
