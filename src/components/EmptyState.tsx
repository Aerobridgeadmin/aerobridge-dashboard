'use client'
import { LucideIcon, Plus } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-surface-200 bg-white py-16 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
        <Icon className="h-7 w-7 text-brand-500" />
      </div>
      <h3 className="mt-4 text-base font-bold text-surface-800">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-surface-500">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-5 flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 active:scale-[0.98]">
          <Plus className="h-4 w-4" /> {actionLabel}
        </button>
      )}
    </div>
  )
}
