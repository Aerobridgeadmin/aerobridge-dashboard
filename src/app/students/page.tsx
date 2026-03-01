'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import { getStudents } from '@/lib/data'
import { Student } from '@/lib/supabase'
import { Plus, Search, Mail, MoreHorizontal, Loader2 } from 'lucide-react'

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { getStudents().then(d => { setStudents(d); setLoading(false) }) }, [])

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Students" subtitle="Manage learner profiles and progress" />

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search students..." className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]">
            <Plus className="h-4 w-4" /> Add Student
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50/50">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Student</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Enrolled</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Completed</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Progress</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Joined</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, i) => (
                <tr key={student.id} className="animate-slide-up border-b border-surface-100 transition-colors last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
                        {student.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-900">{student.name}</p>
                        <p className="flex items-center gap-1 text-xs text-surface-400"><Mail className="h-3 w-3" />{student.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-surface-700">{student.enrolled_courses}</td>
                  <td className="px-6 py-4 text-sm font-medium text-surface-700">{student.completed_courses}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-100">
                        <div className={`h-full rounded-full transition-all duration-700 ${student.progress === 100 ? 'bg-success-500' : student.progress > 70 ? 'bg-brand-500' : student.progress > 40 ? 'bg-warning-500' : 'bg-cta-500'}`} style={{ width: `${student.progress}%` }}></div>
                      </div>
                      <span className="text-xs font-medium text-surface-600">{student.progress}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-surface-500">{new Date(student.joined_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-6 py-4">
                    <button className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600"><MoreHorizontal className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  )
}
