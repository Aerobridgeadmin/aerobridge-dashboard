'use client'

import { Search, Bell } from 'lucide-react'

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex items-center justify-between border-b border-surface-200 bg-white px-8 py-4">
      <div>
        <h2 className="text-2xl font-bold text-surface-800">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm font-medium text-surface-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder="Search..."
            className="h-9 w-56 rounded-lg border border-surface-200 bg-surface-50 pl-9 pr-3 text-sm text-surface-700 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
          />
        </div>

        {/* Notifications */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-500 transition-colors hover:bg-surface-50 hover:text-surface-700">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: '#D64541' }}>
            3
          </span>
        </button>
      </div>
    </header>
  )
}
