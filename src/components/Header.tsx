'use client'

import { Search, Bell, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const searchablePages = [
  { label: 'Dashboard', href: '/', keywords: 'home overview stats' },
  { label: 'Courses', href: '/courses', keywords: 'course learning module' },
  { label: 'Students', href: '/students', keywords: 'student learner enrolled' },
  { label: 'Quizzes', href: '/quizzes', keywords: 'quiz test assessment exam' },
  { label: 'Certificates', href: '/certificates', keywords: 'certificate award completion' },
  { label: 'Certifications', href: '/certifications', keywords: 'certification faa icao license rating' },
  { label: 'Batches', href: '/batches', keywords: 'batch cohort group class' },
  { label: 'Live Classes', href: '/live-classes', keywords: 'live class session video meeting' },
  { label: 'Assignments', href: '/assignments', keywords: 'assignment homework task submission' },
  { label: 'Learning Paths', href: '/learning-paths', keywords: 'path curriculum track progression' },
  { label: 'Flight Logbook', href: '/logbook', keywords: 'logbook flight hours pic instrument' },
  { label: 'Discussions', href: '/discussions', keywords: 'discussion forum thread conversation' },
  { label: 'Announcements', href: '/announcements', keywords: 'announcement news update notice' },
  { label: 'Schedule', href: '/schedule', keywords: 'schedule calendar event timetable' },
  { label: 'Reports', href: '/reports', keywords: 'report analytics chart data' },
  { label: 'Attendance', href: '/attendance', keywords: 'attendance check-in presence' },
  { label: 'Staff', href: '/employees', keywords: 'employee staff instructor team' },
  { label: 'User Management', href: '/users', keywords: 'user role admin management' },
  { label: 'Settings', href: '/settings', keywords: 'settings profile password notification preference' },
]

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { profile } = useAuth()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const roleBadge = profile?.role === 'admin' ? 'badge-rose' : profile?.role === 'instructor' ? 'badge-blue' : 'badge-green'

  const results = searchQuery.trim()
    ? searchablePages.filter(p =>
        p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.keywords.includes(searchQuery.toLowerCase())
      )
    : []

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }, [searchOpen])

  return (
    <>
      <header className="flex items-center justify-between border-b border-surface-200 bg-white px-8 py-4">
        <div>
          <h2 className="text-2xl font-bold text-surface-800">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm font-medium text-surface-500">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setSearchOpen(true)} className="relative flex h-9 items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 text-sm text-surface-400 transition-all hover:border-surface-300">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden rounded bg-surface-200 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 sm:inline">Cmd+K</kbd>
          </button>

          <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-500 transition-colors hover:bg-surface-50 hover:text-surface-700">
            <Bell className="h-4 w-4" />
          </button>

          {profile && (
            <Link href="/settings" className="flex items-center gap-2.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 transition-colors hover:bg-surface-50">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-bold text-white">
                {getInitials(profile.full_name)}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-surface-800">{profile.full_name}</p>
                <span className={`badge ${roleBadge} !px-1.5 !py-0 text-[9px] capitalize`}>{profile.role}</span>
              </div>
            </Link>
          )}
        </div>
      </header>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh] backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-lg mx-4 rounded-xl bg-white shadow-elevated" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-surface-100 px-4 py-3">
              <Search className="h-5 w-5 text-surface-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search pages, features..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 text-sm outline-none placeholder:text-surface-400"
              />
              <button onClick={() => setSearchOpen(false)} className="rounded-lg p-1 text-surface-400 hover:text-surface-600"><X className="h-4 w-4" /></button>
            </div>
            {results.length > 0 && (
              <div className="max-h-80 overflow-y-auto p-2">
                {results.map(page => (
                  <button
                    key={page.href}
                    onClick={() => { router.push(page.href); setSearchOpen(false); setSearchQuery('') }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-surface-700 transition-colors hover:bg-brand-50 hover:text-brand-600"
                  >
                    {page.label}
                  </button>
                ))}
              </div>
            )}
            {searchQuery && results.length === 0 && (
              <div className="p-6 text-center text-sm text-surface-400">No results found for &ldquo;{searchQuery}&rdquo;</div>
            )}
            {!searchQuery && (
              <div className="p-4 text-center text-xs text-surface-400">Type to search pages and features</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
