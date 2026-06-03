import * as React from 'react'
import { cn } from '../lib/cn'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  outline: 'border border-slate-200 text-slate-600 bg-transparent',
}

export const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
      variantClasses[variant],
      className,
    )}
    {...props}
  />
)
