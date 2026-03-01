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
    bg: 'rgba(11, 61, 145, 0.08)',
    icon: '#0B3D91',
    ring: 'rgba(11, 61, 145, 0.04)',
  },
  emerald: {
    bg: 'rgba(40, 167, 69, 0.1)',
    icon: '#28a745',
    ring: 'rgba(40, 167, 69, 0.05)',
  },
  amber: {
    bg: 'rgba(255, 193, 7, 0.12)',
    icon: '#e0a800',
    ring: 'rgba(255, 193, 7, 0.06)',
  },
  rose: {
    bg: 'rgba(214, 69, 65, 0.08)',
    icon: '#D64541',
    ring: 'rgba(214, 69, 65, 0.04)',
  },
  violet: {
    bg: 'rgba(135, 206, 235, 0.15)',
    icon: '#17a2b8',
    ring: 'rgba(135, 206, 235, 0.08)',
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
          <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{title}</p>
          <p className="mt-2 text-3xl font-extrabold text-surface-800">{value}</p>
          {change && (
            <p className={`mt-1.5 text-xs font-medium ${
              changeType === 'positive' ? 'text-success-500' :
              changeType === 'negative' ? 'text-danger-500' :
              'text-surface-500'
            }`}>
              {change}
            </p>
          )}
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ backgroundColor: colors.bg, boxShadow: `0 0 0 4px ${colors.ring}` }}
        >
          <Icon className="h-5 w-5" style={{ color: colors.icon }} />
        </div>
      </div>
    </div>
  )
}
