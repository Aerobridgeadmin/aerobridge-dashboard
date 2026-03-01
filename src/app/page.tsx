'use client'

import Header from '@/components/Header'
import StatCard from '@/components/StatCard'
import { stats, revenueData, courses, activityFeed } from '@/lib/data'
import {
  Users,
  BookOpen,
  Layers,
  Award,
  TrendingUp,
  Target,
  UserPlus,
  GraduationCap,
  MessageSquare,
  ClipboardCheck,
  ArrowUpRight,
} from 'lucide-react'

const activityIcons: Record<string, any> = {
  enrollment: UserPlus,
  completion: GraduationCap,
  quiz: ClipboardCheck,
  certificate: Award,
  batch: Layers,
}

const activityColors: Record<string, string> = {
  enrollment: 'bg-brand-50 text-brand-500',
  completion: 'bg-emerald-50 text-emerald-500',
  quiz: 'bg-violet-50 text-violet-500',
  certificate: 'bg-amber-50 text-amber-500',
  batch: 'bg-rose-50 text-rose-500',
}

export default function DashboardPage() {
  const maxEnrollment = Math.max(...revenueData.map((d) => d.enrollments))

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Dashboard" subtitle="Welcome back — here's what's happening today" />

      <div className="p-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Students"
            value={stats.totalStudents.toLocaleString()}
            change="+156 this month"
            changeType="positive"
            icon={Users}
            color="blue"
            delay={50}
          />
          <StatCard
            title="Active Courses"
            value={stats.totalCourses}
            change="5 published this quarter"
            changeType="positive"
            icon={BookOpen}
            color="emerald"
            delay={100}
          />
          <StatCard
            title="Active Batches"
            value={stats.activeBatches}
            change="3 starting soon"
            changeType="neutral"
            icon={Layers}
            color="amber"
            delay={150}
          />
          <StatCard
            title="Certificates Issued"
            value={stats.certificatesIssued.toLocaleString()}
            change="+89 this month"
            changeType="positive"
            icon={Award}
            color="violet"
            delay={200}
          />
        </div>

        {/* Charts Row */}
        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Enrollment Chart */}
          <div className="card col-span-2 animate-slide-up p-6" style={{ animationDelay: '250ms', animationFillMode: 'both' }}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-surface-900">Enrollment & Completions</h3>
                <p className="text-xs text-surface-500">Last 6 months trend</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-500"></span>
                  Enrollments
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                  Completions
                </span>
              </div>
            </div>

            {/* Simple Bar Chart */}
            <div className="flex items-end gap-3" style={{ height: '200px' }}>
              {revenueData.map((d, i) => (
                <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-end justify-center gap-1" style={{ height: '180px' }}>
                    <div
                      className="w-5 rounded-t-md bg-brand-500 transition-all duration-500"
                      style={{
                        height: `${(d.enrollments / maxEnrollment) * 100}%`,
                        animationDelay: `${300 + i * 80}ms`,
                      }}
                    ></div>
                    <div
                      className="w-5 rounded-t-md bg-emerald-400 transition-all duration-500"
                      style={{
                        height: `${(d.completions / maxEnrollment) * 100}%`,
                        animationDelay: `${350 + i * 80}ms`,
                      }}
                    ></div>
                  </div>
                  <span className="text-[11px] text-surface-500">{d.month}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Completion Rate Ring */}
          <div className="card animate-slide-up p-6" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
            <h3 className="text-sm font-semibold text-surface-900">Completion Rate</h3>
            <p className="text-xs text-surface-500">Overall course completion</p>

            <div className="mt-6 flex flex-col items-center">
              <div className="relative h-36 w-36">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"
                    fill="none"
                    stroke="#0c8ce8"
                    strokeWidth="3"
                    strokeDasharray={`${stats.completionRate}, 100`}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-3xl text-surface-900">{stats.completionRate}%</span>
                </div>
              </div>

              <div className="mt-4 grid w-full grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-50 p-3 text-center">
                  <p className="font-display text-lg text-surface-900">1,893</p>
                  <p className="text-[10px] uppercase tracking-wider text-surface-500">Completed</p>
                </div>
                <div className="rounded-lg bg-surface-50 p-3 text-center">
                  <p className="font-display text-lg text-surface-900">519</p>
                  <p className="text-[10px] uppercase tracking-wider text-surface-500">In Progress</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Top Courses */}
          <div className="card col-span-2 animate-slide-up p-6" style={{ animationDelay: '350ms', animationFillMode: 'both' }}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">Top Courses by Enrollment</h3>
              <a href="/courses" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                View all <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>

            <div className="space-y-3">
              {courses
                .filter((c) => c.published)
                .sort((a, b) => b.enrolled_count - a.enrolled_count)
                .slice(0, 4)
                .map((course, i) => {
                  const maxEnrolled = courses[0].enrolled_count || 1
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
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all duration-700"
                            style={{ width: `${(course.enrolled_count / 728) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                      <span className="w-12 text-right text-sm font-semibold text-surface-700">
                        {course.enrolled_count}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="card animate-slide-up p-6" style={{ animationDelay: '400ms', animationFillMode: 'both' }}>
            <h3 className="mb-4 text-sm font-semibold text-surface-900">Recent Activity</h3>

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
          </div>
        </div>
      </div>
    </div>
  )
}
