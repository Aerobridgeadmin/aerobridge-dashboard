'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, GraduationCap, Users, Layers, ClipboardCheck, Award, Video, FileText, UserCog, Clock, CalendarDays, ChevronLeft, ChevronRight, Plane, Megaphone, MessageCircle, Settings, LogOut, Shield, Route, BarChart3, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const { profile, signOut, isAdmin, isInstructor } = useAuth()

  const sections = [
    { label: 'Overview', items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/schedule', label: 'Schedule', icon: CalendarDays },
      { href: '/announcements', label: 'Announcements', icon: Megaphone },
    ]},
    { label: 'Learning', items: [
      { href: '/courses', label: 'Courses', icon: BookOpen },
      { href: '/courses/exam-prep', label: 'Exam Prep', icon: GraduationCap },
      { href: '/learning-paths', label: 'Learning Paths', icon: Route },
      ...(isAdmin || isInstructor ? [{ href: '/batches', label: 'Batches', icon: Layers }] : []),
      { href: '/live-classes', label: 'Live Classes', icon: Video },
      { href: '/quizzes', label: 'Quizzes', icon: ClipboardCheck },
      ...(isAdmin || isInstructor ? [{ href: '/assignments', label: 'Assignments', icon: FileText }] : []),
      { href: '/certificates', label: 'Certificates', icon: Award },
      { href: '/discussions', label: 'Discussions', icon: MessageCircle },
    ]},
    { label: 'Aviation', items: [
      { href: '/certifications', label: 'Certifications', icon: Shield },
      { href: '/logbook', label: 'Flight Logbook', icon: Plane },
      ...(isAdmin || isInstructor ? [{ href: '/reports', label: 'Reports', icon: BarChart3 }] : []),
    ]},
    ...(isAdmin ? [{ label: 'People', items: [
      { href: '/students', label: 'Students', icon: Users },
      { href: '/employees', label: 'Staff', icon: UserCog },
      { href: '/attendance', label: 'Attendance', icon: Clock },
      { href: '/users', label: 'User Management', icon: Shield },
    ]},
    { label: 'Admin', items: [
      { href: '/admin/email-templates', label: 'Email Templates', icon: Mail },
    ]}] : isInstructor ? [{ label: 'People', items: [
      { href: '/students', label: 'Students', icon: Users },
    ]}] : []),
  ]

  const roleBadge = profile?.role === 'admin' ? 'bg-cta-500' : profile?.role === 'instructor' ? 'bg-info-500' : 'bg-success-500'

  return (
    <aside className={`fixed left-0 top-0 z-40 flex h-screen flex-col transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-[250px]'} bg-brand-700`}>
      <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
        {collapsed ? (
          <img src="/images/logo-light.png" alt="AeroBridge" className="h-8 w-8 shrink-0 object-contain" />
        ) : (
          <img src="/images/logo-light.png" alt="AeroBridge" className="h-9 object-contain" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {sections.map(s => (
          <div key={s.label} className="mb-1">
            {!collapsed && <p className="mb-1 px-5 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">{s.label}</p>}
            {s.items.map(item => {
              const isActive = pathname === item.href
              return (
                <Link key={item.href} href={item.href} className={`mx-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all ${isActive ? 'bg-white/15 font-bold text-white' : 'font-medium text-white/60 hover:bg-white/8 hover:text-white'}`} title={collapsed ? item.label : undefined}>
                  <item.icon className={`h-[16px] w-[16px] shrink-0 ${isActive ? 'text-white' : 'text-white/40'}`} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* User section */}
      <div className="border-t border-white/10 p-3">
        {!collapsed && profile && (
          <div className="mb-2 rounded-lg bg-white/8 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold text-white">
                {profile.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{profile.full_name || 'User'}</p>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${roleBadge}`}></span>
                  <span className="text-[10px] capitalize text-white/50">{profile.role}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        <Link href="/settings" className={`mx-0 mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-all ${pathname === '/settings' ? 'bg-white/15 font-bold text-white' : 'text-white/50 hover:bg-white/8 hover:text-white/70'}`}>
          <Settings className="h-4 w-4" />{!collapsed && <span>Settings</span>}
        </Link>
        <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-white/40 hover:bg-white/8 hover:text-white/70">
          <LogOut className="h-4 w-4" />{!collapsed && <span>Sign Out</span>}
        </button>
        <button onClick={onToggle} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-white/30 hover:bg-white/8 hover:text-white/50">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  )
}
