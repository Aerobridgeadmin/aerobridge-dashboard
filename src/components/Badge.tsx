import type { ReactNode } from 'react'

export type BadgeVariant =
  | 'blue'
  | 'green'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'sky'
  | 'slate'
  | 'emerald'
  | 'indigo'
  | 'cyan'
  | 'teal'

export interface BadgeProps {
  variant?: BadgeVariant
  size?: 'sm' | 'lg'
  dot?: boolean
  children?: ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, { pill: string; dot: string }> = {
  blue: {
    pill: 'bg-blue-50 text-blue-700 ring-blue-200/80',
    dot: 'bg-blue-500',
  },
  green: {
    pill: 'bg-success-50 text-success-600 ring-success-200/80',
    dot: 'bg-success-500',
  },
  amber: {
    pill: 'bg-amber-50 text-amber-800 ring-amber-200/80',
    dot: 'bg-amber-500',
  },
  rose: {
    pill: 'bg-rose-50 text-rose-700 ring-rose-200/80',
    dot: 'bg-rose-500',
  },
  violet: {
    pill: 'bg-violet-50 text-violet-700 ring-violet-200/80',
    dot: 'bg-violet-500',
  },
  sky: {
    pill: 'bg-sky-50 text-sky-700 ring-sky-200/80',
    dot: 'bg-sky-500',
  },
  slate: {
    pill: 'bg-slate-100 text-slate-700 ring-slate-300/80',
    dot: 'bg-slate-500',
  },
  emerald: {
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
    dot: 'bg-emerald-500',
  },
  indigo: {
    pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200/80',
    dot: 'bg-indigo-500',
  },
  cyan: {
    pill: 'bg-cyan-50 text-cyan-700 ring-cyan-200/80',
    dot: 'bg-cyan-500',
  },
  teal: {
    pill: 'bg-info-50 text-info-600 ring-info-200/80',
    dot: 'bg-info-500',
  },
}

const sizeClasses: Record<NonNullable<BadgeProps['size']>, string> = {
  sm: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
}

export function Badge({
  variant = 'slate',
  size = 'sm',
  dot = false,
  children,
  className = '',
}: BadgeProps) {
  const styles = variantStyles[variant]

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset',
        styles.pill,
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? (
        <span
          className={['h-1.5 w-1.5 shrink-0 rounded-full', styles.dot].join(' ')}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  )
}
