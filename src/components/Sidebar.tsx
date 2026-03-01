'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Layers,
  ClipboardCheck,
  Award,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plane,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/courses', label: 'Courses', icon: BookOpen },
  { href: '/students', label: 'Students', icon: Users },
  { href: '/batches', label: 'Batches', icon: Layers },
  { href: '/quizzes', label: 'Quizzes', icon: ClipboardCheck },
  { href: '/certificates', label: 'Certificates', icon: Award },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[72px]' : 'w-[260px]'
      }`}
      style={{ backgroundColor: '#0B3D91' }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <Plane className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in">
            <h1 className="text-[15px] font-extrabold uppercase tracking-wide text-white">AeroBridge</h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/50">Dashboard</p>
          </div>
        )}
      </div>

      {/* User pill */}
      {!collapsed && (
        <div className="mx-3 mt-4 flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
            A
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Admin</p>
            <p className="text-[10px] text-white/50">Administrator</p>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="mt-5 flex flex-col gap-0.5 px-3">
        <p className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30 ${collapsed ? 'hidden' : ''}`}>
          Menu
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-all duration-150 ${
                isActive
                  ? 'bg-white/15 font-bold text-white'
                  : 'font-medium text-white/70 hover:bg-white/8 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                  isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'
                }`}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 p-3">
        <Link
          href="#"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-white/60 transition-colors hover:bg-white/8 hover:text-white"
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-white/40 transition-colors hover:bg-white/8 hover:text-white/70"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
