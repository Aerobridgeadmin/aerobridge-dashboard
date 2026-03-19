'use client'

import { Search, Bell } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { profile } = useAuth()
  const roleBadge = profile?.role === 'admin' ? 'badge-rose' : profile?.role === 'instructor' ? 'badge-blue' : 'badge-green'

  return (
    <header className="flex items-center justify-between border-b border-surface-200 bg-white px-8 py-4">
      <div>
        <h2 className="text-2xl font-bold text-surface-800">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm font-medium text-surface-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <input type="text" placeholder="Search..." className="h-9 w-56 rounded-lg border border-surface-200 bg-surface-50 pl-9 pr-3 text-sm text-surface-700 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
        </div>

        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-500 transition-colors hover:bg-surface-50 hover:text-surface-700">
          <Bell className="h-4 w-4" />
        </button>

        {profile && (
          <Link href="/settings" className="flex items-center gap-2.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 transition-colors hover:bg-surface-50">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-bold text-white">
              {profile.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-surface-800">{profile.full_name}</p>
              <span className={`badge ${roleBadge} !px-1.5 !py-0 text-[9px] capitalize`}>{profile.role}</span>
            </div>
          </Link>
        )}
      </div>
    </header>
  )
}
