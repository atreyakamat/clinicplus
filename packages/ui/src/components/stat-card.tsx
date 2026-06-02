import * as React from 'react'
import { cn } from '../lib/cn'

export type StatCardProps = React.HTMLAttributes<HTMLDivElement> & {
  label: string
  value: string
  change?: string
}

export const StatCard = ({ className, label, value, change, ...props }: StatCardProps) => (
  <div
    className={cn(
      'rounded-xl border border-slate-200 bg-white p-4 shadow-[0px_2px_8px_rgba(15,23,42,0.06)]',
      className,
    )}
    {...props}
  >
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <div className="mt-2 flex items-baseline gap-2">
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
      {change && <span className="text-xs font-medium text-emerald-600">{change}</span>}
    </div>
  </div>
)
