'use client'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-200 ${className}`.trim()} />
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-surface-100 bg-white p-5 shadow-card">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-2 h-8 w-40" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div className="space-y-3 rounded-xl border border-surface-100 bg-white p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <Skeleton className="mb-2 h-3 w-28" />
          <Skeleton className="mb-2 h-9 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
      </div>
    </div>
  )
}
