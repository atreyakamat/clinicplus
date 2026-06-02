import * as React from 'react'
import { cn } from '../lib/cn'

export type CardProps = React.HTMLAttributes<HTMLDivElement>

export const Card = ({ className, ...props }: CardProps) => (
  <div
    className={cn(
      'rounded-xl border border-slate-200 bg-white p-5 shadow-[0px_2px_8px_rgba(15,23,42,0.06)]',
      className,
    )}
    {...props}
  />
)
