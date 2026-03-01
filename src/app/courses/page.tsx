'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import { getCourses } from '@/lib/data'
import { Course } from '@/lib/supabase'
import { Plus, BookOpen, Users, Layers2, MoreVertical, Search, Loader2 } from 'lucide-react'

const categoryColors: Record<string, string> = {
  Operations: 'badge-blue',
  Navigation: 'badge-green',
  Certification: 'badge-amber',
  Technical: 'bg-violet-50 text-violet-700',
  Safety: 'badge-rose',
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { getCourses().then(d => { setCourses(d); setLoading(false) }) }, [])

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Courses" subtitle="Manage your learning content" />

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search courses..." className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-100" />
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md active:scale-[0.98]">
            <Plus className="h-4 w-4" /> New Course
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course, i) => (
            <div key={course.id} className="card group animate-slide-up overflow-hidden" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
              <div className="relative h-36 bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400 p-5">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%221%22%20cy%3D%221%22%20r%3D%221%22%20fill%3D%22rgba(255%2C255%2C255%2C0.08)%22%2F%3E%3C%2Fsvg%3E')]"></div>
                <div className="relative z-10">
                  <span className={`badge ${categoryColors[course.category] || 'badge-blue'} !bg-white/20 !text-white backdrop-blur-sm`}>{course.category}</span>
                  <h3 className="mt-3 font-display text-xl leading-tight text-white">{course.title}</h3>
                </div>
                {!course.published && (
                  <div className="absolute right-3 top-3 rounded-full bg-surface-900/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">Draft</div>
                )}
              </div>
              <div className="p-5">
                <p className="line-clamp-2 text-xs leading-relaxed text-surface-500">{course.description}</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-100 text-[10px] font-semibold text-surface-600">
                    {course.instructor.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <span className="text-xs font-medium text-surface-600">{course.instructor}</span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-surface-100 pt-4">
                  <div className="flex items-center gap-4 text-xs text-surface-500">
                    <span className="flex items-center gap-1"><Layers2 className="h-3.5 w-3.5" />{course.chapters_count} chapters</span>
                    <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{course.lessons_count} lessons</span>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-surface-700">
                    <Users className="h-3.5 w-3.5 text-brand-500" />{course.enrolled_count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  )
}
