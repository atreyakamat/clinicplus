import * as React from 'react'
import { cn } from '../lib/cn'

export type PageHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string
  description?: string
  actions?: React.ReactNode
}

export const PageHeader = ({ className, title, description, actions, ...props }: PageHeaderProps) => (
  <div className={cn('flex flex-wrap items-center justify-between gap-4', className)} {...props}>
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
)
