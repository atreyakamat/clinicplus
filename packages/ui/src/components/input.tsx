import * as React from 'react'
import { cn } from '../lib/cn'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  helperText?: string
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helperText, error, ...props }, ref) => (
    <label className="flex w-full flex-col gap-1 text-sm text-slate-700">
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      <input
        ref={ref}
        className={cn(
          'h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-clinic-blue focus:ring-2 focus:ring-clinic-blue/15',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          className,
        )}
        {...props}
      />
      {error ? (
        <span className="text-xs text-red-600">{error}</span>
      ) : (
        helperText && <span className="text-xs text-slate-500">{helperText}</span>
      )}
    </label>
  ),
)

Input.displayName = 'Input'
