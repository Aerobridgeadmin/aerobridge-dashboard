'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import StatCard from '@/components/StatCard'
import { getDashboardStats, getCourses, getActivityFeed, getMonthlyStats, getLeads } from '@/lib/data'
import { DashboardStats, Course, Lead } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  Users, BookOpen, Layers, Award,
  UserPlus, GraduationCap, MessageSquare, ClipboardCheck,
  ArrowUpRight, Loader2, Video, FileText, UserCog, Plus, Target, TrendingUp, CalendarCheck,
} from 'lucide-react'
import Link from 'next/link'

const activityIcons: Record<string, any> = {
  enrollment: UserPlus,
  completion: GraduationCap,
  quiz: ClipboardCheck,
  certificate: Award,
  batch: Layers,
}

const activityColors: Record<string, string> = {
  enrollment: 'bg-brand-50 text-brand-500',
  completion: 'bg-success-50 text-success-500',
  quiz: 'bg-info-50 text-info-500',
  certificate: 'bg-warning-50 text-warning-500',
  batch: 'bg-cta-500/10 text-cta-500',
}

export default function DashboardPage() {
  const { profile, isAdmin, isInstructor } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [activityFeed, setActivityFeed] = useState<any[]>([])
  const [monthlyData, setMonthlyData] = useState<{ month: string; enrollments: number; completions: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [s, c, a, m] = await Promise.all([
          getDashboardStats(),
          getCourses(),
          getActivityFeed(),
          getMonthlyStats(),
        ])
        setStats(s)
        setCourses(c)
        setActivityFeed(a)
        setMonthlyData(m)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const greeting = profile?.full_name ? `Welcome back, ${profile.full_name.split(' ')[0]}` : 'Welcome back'
  const subtitle = isAdmin ? 'Here\'s your business at a glance' : isInstructor ? 'Here\'s your teaching overview' : 'Here\'s your learning progress'

  if (error) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header title={greeting} subtitle={subtitle} />
        <div className="flex flex-col items-center justify-center p-20 text-center">
          <p className="text-sm text-red-500 mb-2">Something went wrong loading the dashboard.</p>
          <p className="text-xs text-surface-400">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600">Retry</button>
        </div>
      </div>
    )
  }

  if (loading || !stats) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header title={greeting} subtitle={subtitle} />
        <div className="flex items-center justify-center p-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      </div>
    )
  }

  const isEmpty = stats.totalStudents === 0 && stats.totalCourses === 0 && stats.activeStaff === 0
  const maxEnrollment = monthlyData.length > 0 ? Math.max(...monthlyData.map(d => d.enrollments), 1) : 1

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title={greeting} subtitle={subtitle} />

      <div className="p-8">
        {/* Welcome banner for empty state (admin only) */}
        {isAdmin && isEmpty && (
          <div className="mb-8 animate-slide-up rounded-xl border border-brand-200 bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-8 text-white">
            <h2 className="text-2xl font-extrabold">Welcome to AeroBridge LMS</h2>
            <p className="mt-2 max-w-lg text-sm font-medium text-white/80">
              Get started by adding your first course, enrolling students, and building your training program.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/courses" className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-600 shadow-sm transition-all hover:bg-white/90">
                <Plus className="h-4 w-4" /> Create Course
              </Link>
              <Link href="/students" className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/25">
                <UserPlus className="h-4 w-4" /> Add Students
              </Link>
              <Link href="/employees" className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/25">
                <UserCog className="h-4 w-4" /> Add Staff
              </Link>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Students" value={stats.totalStudents.toLocaleString()} change={stats.recentEnrollments > 0 ? `+${stats.recentEnrollments} this month` : 'No enrollments yet'} changeType={stats.recentEnrollments > 0 ? 'positive' : 'neutral'} icon={Users} color="blue" delay={50} />
          <StatCard title="Active Courses" value={stats.totalCourses} change={stats.totalCourses > 0 ? `${courses.filter(c => c.published).length} published` : 'Create your first course'} changeType={stats.totalCourses > 0 ? 'positive' : 'neutral'} icon={BookOpen} color="emerald" delay={100} />
          <StatCard title="Active Batches" value={stats.activeBatches} change={stats.activeBatches > 0 ? 'Running now' : 'No active batches'} changeType="neutral" icon={Layers} color="amber" delay={150} />
          <StatCard title="Certificates Issued" value={stats.certificatesIssued.toLocaleString()} change={stats.certificatesIssued > 0 ? 'Total awarded' : 'None issued yet'} changeType={stats.certificatesIssued > 0 ? 'positive' : 'neutral'} icon={Award} color="violet" delay={200} />
        </div>

        {/* Admin: Leads Pipeline + Operational Stats */}
        {isAdmin && (
          <>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <StatCard title="Total Leads" value={stats.totalLeads ?? 0} change="From website" changeType="neutral" icon={Target} color="blue" delay={220} />
              <StatCard title="Upcoming Consultations" value={stats.upcomingConsultations ?? 0} change={stats.upcomingConsultations ? 'Scheduled' : 'None upcoming'} changeType={stats.upcomingConsultations ? 'positive' : 'neutral'} icon={CalendarCheck} color="emerald" delay={240} />
              <StatCard title="Converted Leads" value={stats.convertedLeads ?? 0} change={stats.totalLeads ? `${Math.round(((stats.convertedLeads ?? 0) / stats.totalLeads) * 100)}% rate` : 'No leads yet'} changeType={stats.convertedLeads ? 'positive' : 'neutral'} icon={TrendingUp} color="amber" delay={260} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <StatCard title="Active Staff" value={stats.activeStaff} change={stats.activeStaff > 0 ? 'Team members' : 'Add staff members'} changeType="neutral" icon={UserCog} color="blue" delay={280} />
              <StatCard title="Upcoming Classes" value={stats.upcomingClasses} change={stats.upcomingClasses > 0 ? 'Scheduled' : 'None scheduled'} changeType={stats.upcomingClasses > 0 ? 'positive' : 'neutral'} icon={Video} color="emerald" delay={300} />
              <StatCard title="Active Assignments" value={stats.activeAssignments} change={stats.activeAssignments > 0 ? 'In progress' : 'No active assignments'} changeType="neutral" icon={FileText} color="amber" delay={320} />
            </div>
          </>
        )}

        {/* Instructor: Teaching Stats */}
        {isInstructor && (
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <StatCard title="Upcoming Classes" value={stats.upcomingClasses} change={stats.upcomingClasses > 0 ? 'Scheduled' : 'None scheduled'} changeType={stats.upcomingClasses > 0 ? 'positive' : 'neutral'} icon={Video} color="blue" delay={250} />
            <StatCard title="Active Assignments" value={stats.activeAssignments} change={stats.activeAssignments > 0 ? 'In progress' : 'No active assignments'} changeType="neutral" icon={FileText} color="emerald" delay={300} />
            <StatCard title="Completion Rate" value={`${stats.completionRate}%`} change="Average across courses" changeType="neutral" icon={GraduationCap} color="amber" delay={350} />
          </div>
        )}

        {/* Charts Row */}
        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Enrollment Chart */}
          <div className="card col-span-2 animate-slide-up p-6" style={{ animationDelay: '250ms', animationFillMode: 'both' }}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-surface-900">Enrollment & Completions</h3>
                <p className="text-xs text-surface-500">Monthly trend</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-500"></span>
                  Enrollments
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-success-500"></span>
                  Completions
                </span>
              </div>
            </div>

            {monthlyData.length > 0 ? (
              <div className="flex items-end gap-3" style={{ height: '200px' }}>
                {monthlyData.map((d, i) => (
                  <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full items-end justify-center gap-1" style={{ height: '180px' }}>
                      <div
                        className="w-5 rounded-t-md bg-brand-500 transition-all duration-500"
                        style={{ height: `${(d.enrollments / maxEnrollment) * 100}%`, animationDelay: `${300 + i * 80}ms` }}
                      ></div>
                      <div
                        className="w-5 rounded-t-md bg-success-500 transition-all duration-500"
                        style={{ height: `${(d.completions / maxEnrollment) * 100}%`, animationDelay: `${350 + i * 80}ms` }}
                      ></div>
                    </div>
                    <span className="text-[11px] text-surface-500">{d.month}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-100">
                  <Users className="h-6 w-6 text-surface-300" />
                </div>
                <p className="mt-3 text-sm font-medium text-surface-500">No enrollment data yet</p>
                <p className="mt-1 text-xs text-surface-400">Chart will populate as students enroll</p>
              </div>
            )}
          </div>

          {/* Completion Rate Ring */}
          <div className="card animate-slide-up p-6" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
            <h3 className="text-sm font-semibold text-surface-900">Completion Rate</h3>
            <p className="text-xs text-surface-500">Overall course completion</p>
            <div className="mt-6 flex flex-col items-center">
              <div className="relative h-36 w-36">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831" fill="none" stroke="#0B3D91" strokeWidth="3" strokeDasharray={`${stats.completionRate}, 100`} strokeLinecap="round" className="transition-all duration-1000" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold text-surface-900">{stats.completionRate}%</span>
                </div>
              </div>
              <div className="mt-4 grid w-full grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-50 p-3 text-center">
                  <p className="text-lg font-bold text-surface-900">{stats.certificatesIssued}</p>
                  <p className="text-[10px] uppercase tracking-wider text-surface-500">Completed</p>
                </div>
                <div className="rounded-lg bg-surface-50 p-3 text-center">
                  <p className="text-lg font-bold text-surface-900">{Math.max(0, stats.totalStudents - stats.certificatesIssued)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-surface-500">In Progress</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Top Courses or Getting Started */}
          <div className="card col-span-2 animate-slide-up p-6" style={{ animationDelay: '350ms', animationFillMode: 'both' }}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">{courses.length > 0 ? 'Top Courses by Enrollment' : 'Quick Start Guide'}</h3>
              {courses.length > 0 && (
                <Link href="/courses" className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600">
                  View all <ArrowUpRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {courses.length > 0 ? (
              <div className="space-y-3">
                {courses
                  .filter(c => c.published)
                  .sort((a, b) => b.enrolled_count - a.enrolled_count)
                  .slice(0, 5)
                  .map((course, i) => {
                    const topEnrolled = courses.reduce((max, c) => Math.max(max, c.enrolled_count), 1)
                    return (
                      <div key={course.id} className="group flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-surface-50">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-100 font-mono text-sm font-semibold text-surface-500">
                          {String(i + 1).padStart(2, '0')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-surface-900">{course.title}</p>
                          <p className="text-xs text-surface-500">{course.instructor}</p>
                        </div>
                        <div className="w-32">
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-100">
                            <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${(course.enrolled_count / (topEnrolled || 1)) * 100}%` }}></div>
                          </div>
                        </div>
                        <span className="w-12 text-right text-sm font-semibold text-surface-700">{course.enrolled_count}</span>
                      </div>
                    )
                  })}
                {courses.filter(c => c.published).length === 0 && (
                  <p className="py-6 text-center text-sm text-surface-400">No published courses yet. Publish a course to see it here.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { step: '01', title: 'Create your first course', desc: 'Add learning content for your students', href: '/courses', done: stats.totalCourses > 0 },
                  { step: '02', title: 'Add students', desc: 'Enroll learners in your platform', href: '/students', done: stats.totalStudents > 0 },
                  { step: '03', title: 'Add staff members', desc: 'Set up instructors and administrators', href: '/employees', done: stats.activeStaff > 0 },
                  { step: '04', title: 'Schedule a live class', desc: 'Set up your first virtual session', href: '/live-classes', done: stats.upcomingClasses > 0 },
                  { step: '05', title: 'Create a quiz', desc: 'Assess student knowledge', href: '/quizzes', done: false },
                ].map((item) => (
                  <Link key={item.step} href={item.href} className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-surface-50">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold ${item.done ? 'bg-success-50 text-success-500' : 'bg-surface-100 text-surface-500'}`}>
                      {item.done ? '✓' : item.step}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${item.done ? 'text-surface-400 line-through' : 'text-surface-900'}`}>{item.title}</p>
                      <p className="text-xs text-surface-500">{item.desc}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-surface-300" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="card animate-slide-up p-6" style={{ animationDelay: '400ms', animationFillMode: 'both' }}>
            <h3 className="mb-4 text-sm font-semibold text-surface-900">Recent Activity</h3>
            {activityFeed.length > 0 ? (
              <div className="space-y-4">
                {activityFeed.map((item, i) => {
                  const IconComp = activityIcons[item.type] || MessageSquare
                  const colorClass = activityColors[item.type] || 'bg-surface-100 text-surface-500'
                  return (
                    <div key={i} className="flex gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
                        <IconComp className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs leading-relaxed text-surface-700">{item.text}</p>
                        <p className="mt-0.5 text-[10px] text-surface-400">{item.time}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-center">
                <MessageSquare className="h-8 w-8 text-surface-200" />
                <p className="mt-2 text-xs text-surface-400">Activity will appear here as you use the platform</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
