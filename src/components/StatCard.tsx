'use client'

import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon: LucideIcon
  color: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet'
  delay?: number
}

const colorMap = {
  blue: {
    bg: 'bg-brand-50',
    icon: 'text-brand-500',
    ring: 'ring-brand-100',
  },
  emerald: {
    bg: 'bg-emerald-50',
    icon: 'text-emerald-500',
    ring: 'ring-emerald-100',
  },
  amber: {
    bg: 'bg-amber-50',
    icon: 'text-amber-500',
    ring: 'ring-amber-100',
  },
  rose: {
    bg: 'bg-rose-50',
    icon: 'text-rose-500',
    ring: 'ring-rose-100',
  },
  violet: {
    bg: 'bg-violet-50',
    icon: 'text-violet-500',
    ring: 'ring-violet-100',
  },
}

export default function StatCard({ title, value, change, changeType = 'neutral', icon: Icon, color, delay = 0 }: StatCardProps) {
  const colors = colorMap[color]

  return (
    <div
      className="card animate-slide-up p-5"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-surface-500">{title}</p>
          <p className="mt-2 font-display text-3xl text-surface-900">{value}</p>
          {change && (
            <p className={`mt-1.5 text-xs font-medium ${
              changeType === 'positive' ? 'text-emerald-600' :
              changeType === 'negative' ? 'text-rose-600' :
              'text-surface-500'
            }`}>
              {change}
            </p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.bg} ring-4 ${colors.ring}`}>
          <Icon className={`h-5 w-5 ${colors.icon}`} />
        </div>
      </div>
    </div>
  )
}
