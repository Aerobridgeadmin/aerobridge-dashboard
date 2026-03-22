'use client'

import { Loader2, type LucideIcon } from 'lucide-react'
import { forwardRef } from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: LucideIcon
  fullWidth?: boolean
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-brand-500 text-white shadow-sm hover:bg-brand-600 focus-visible:ring-brand-200',
  secondary:
    'border border-surface-200 bg-white text-surface-800 shadow-sm hover:bg-surface-50 focus-visible:ring-surface-200',
  ghost: 'bg-transparent text-surface-700 hover:bg-surface-100 focus-visible:ring-surface-200',
  danger: 'bg-cta-500 text-white shadow-sm hover:bg-cta-600 focus-visible:ring-cta-600/30',
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'gap-1.5 px-3 py-1.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'gap-2 px-4 py-2 text-sm [&_svg]:h-4 [&_svg]:w-4',
  lg: 'gap-2.5 px-5 py-2.5 text-base [&_svg]:h-5 [&_svg]:w-5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    fullWidth = false,
    className = '',
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center rounded-lg font-medium transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {loading ? (
        <Loader2 className="shrink-0 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon className="shrink-0" aria-hidden />
      ) : null}
      {children}
    </button>
  )
})

Button.displayName = 'Button'
