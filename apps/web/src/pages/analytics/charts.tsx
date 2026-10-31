import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@clinicplus/ui';

/** Fixed categorical order: brand green, then blue, then a neutral slate. */
export const SERIES = ['#1FA971', '#2563EB', '#94A3B8'];
const GRID = '#E2E8F0';
const AXIS = { fontSize: 11, fill: '#64748B' };

const shortDate = (v: string) => {
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const ChartCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <Card className="p-4">
    <div className="mb-3">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
    </div>
    <div className="h-64">{children}</div>
  </Card>
);

export const EmptyChart = ({ message = 'No data for this period.' }: { message?: string }) => (
  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">{message}</div>
);

interface SeriesDef {
  key: string;
  label: string;
}

export const TrendArea = ({
  data,
  xKey,
  series,
  format = (v: number) => String(v),
}: {
  data: any[];
  xKey: string;
  series: SeriesDef[];
  format?: (v: number) => string;
}) => (
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey={xKey} tick={AXIS} tickFormatter={shortDate} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => format(Number(v))} />
      <Tooltip formatter={(v: any, name: any) => [format(Number(v)), name]} labelFormatter={(l) => shortDate(String(l))} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {series.map((s, i) => (
        <Area
          key={s.key}
          type="monotone"
          dataKey={(row: any) => Number(row[s.key])}
          name={s.label}
          stroke={SERIES[i]}
          strokeWidth={2}
          fill={SERIES[i]}
          fillOpacity={i === 0 ? 0.12 : 0}
          dot={false}
          activeDot={{ r: 4 }}
        />
      ))}
    </AreaChart>
  </ResponsiveContainer>
);

export const Bars = ({
  data,
  xKey,
  series,
  stacked = false,
  format = (v: number) => String(v),
  dateAxis = true,
}: {
  data: any[];
  xKey: string;
  series: SeriesDef[];
  stacked?: boolean;
  format?: (v: number) => string;
  dateAxis?: boolean;
}) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey={xKey} tick={AXIS} tickFormatter={dateAxis ? shortDate : undefined} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} allowDecimals={false} tickFormatter={(v) => format(Number(v))} />
      <Tooltip cursor={{ fill: '#F1F5F9' }} formatter={(v: any, name: any) => [format(Number(v)), name]} labelFormatter={(l) => (dateAxis ? shortDate(String(l)) : String(l))} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {series.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={(row: any) => Number(row[s.key])}
          name={s.label}
          fill={SERIES[i]}
          stackId={stacked ? 'a' : undefined}
          radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
          maxBarSize={28}
          stroke="#FFFFFF"
          strokeWidth={stacked ? 1 : 0}
        />
      ))}
    </BarChart>
  </ResponsiveContainer>
);

export const Kpi = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
  </div>
);

export const pctText = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
