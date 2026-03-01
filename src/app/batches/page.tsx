'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import { getBatches } from '@/lib/data'
import { Batch } from '@/lib/supabase'
import { Plus, Search, Calendar, Users, ArrowRight, Loader2 } from 'lucide-react'

const statusStyles: Record<string, string> = {
  active: 'bg-success-50 text-success-500 ring-1 ring-success-500/20',
  upcoming: 'bg-brand-50 text-brand-500 ring-1 ring-brand-500/20',
  completed: 'bg-surface-100 text-surface-500 ring-1 ring-surface-200',
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { getBatches().then(d => { setBatches(d); setLoading(false) }) }, [])

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Batches" subtitle="Group learners and manage cohorts" />

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search batches..." className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]">
            <Plus className="h-4 w-4" /> Create Batch
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {batches.map((batch, i) => (
            <div key={batch.id} className="card group animate-slide-up p-6" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-surface-900">{batch.title}</h3>
                    <span className={`badge text-[10px] ${statusStyles[batch.status]}`}>{batch.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-surface-500">{batch.course_title}</p>
                </div>
                <button className="rounded-lg p-2 text-surface-400 opacity-0 transition-all hover:bg-surface-100 hover:text-surface-600 group-hover:opacity-100">
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-4">
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-400"><Calendar className="h-3 w-3" /> Start</p>
                  <p className="mt-1 text-sm font-medium text-surface-700">{new Date(batch.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-400"><Calendar className="h-3 w-3" /> End</p>
                  <p className="mt-1 text-sm font-medium text-surface-700">{new Date(batch.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-400"><Users className="h-3 w-3" /> Students</p>
                  <p className="mt-1 text-sm font-medium text-surface-700">{batch.student_count} / {batch.max_students}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-100">
                  <div className={`h-full rounded-full transition-all duration-700 ${batch.student_count / batch.max_students > 0.9 ? 'bg-cta-500' : batch.student_count / batch.max_students > 0.7 ? 'bg-warning-500' : 'bg-brand-500'}`} style={{ width: `${(batch.student_count / batch.max_students) * 100}%` }}></div>
                </div>
                <p className="mt-1 text-[10px] text-surface-400">{Math.round((batch.student_count / batch.max_students) * 100)}% capacity</p>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  )
}
