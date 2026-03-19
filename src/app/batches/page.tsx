'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getBatches, getCourses, createBatch, deleteRecord } from '@/lib/data'
import { Batch, Course } from '@/lib/supabase'
import { Plus, Search, Calendar, Users, ArrowRight, Loader2, Layers, Trash2 } from 'lucide-react'
import { RoleVisible } from '@/components/RoleGuard'

const statusStyles: Record<string, string> = {
  active: 'bg-success-50 text-success-500 ring-1 ring-success-500/20',
  upcoming: 'bg-brand-50 text-brand-500 ring-1 ring-brand-500/20',
  completed: 'bg-surface-100 text-surface-500 ring-1 ring-surface-200',
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', course_id: '', course_title: '', start_date: '', end_date: '', max_students: 30, status: 'upcoming' as const })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { Promise.all([getBatches(), getCourses()]).then(([b, c]) => { setBatches(b); setCourses(c); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const filtered = batches.filter(b => b.title.toLowerCase().includes(search.toLowerCase()) || b.course_title?.toLowerCase().includes(search.toLowerCase()))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const course = courses.find(c => c.id === form.course_id)
      await createBatch({ ...form, course_title: course?.title || form.course_title || '' })
      setToast({ message: 'Batch created', type: 'success' })
      setShowModal(false)
      load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete batch "${title}"?`)) return
    try { await deleteRecord('batches', id); setToast({ message: 'Batch deleted', type: 'success' }); load() }
    catch (err: any) { setToast({ message: err.message, type: 'error' }) }
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Batches" subtitle="Group learners and manage cohorts" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search batches..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
          </div>
          <RoleVisible roles={["admin", "instructor"]}><button onClick={() => { setForm({ title: '', course_id: '', course_title: '', start_date: '', end_date: '', max_students: 30, status: 'upcoming' }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]">
            <Plus className="h-4 w-4" /> Create Batch
          </button></RoleVisible>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : filtered.length === 0 && !search ? (
          <EmptyState icon={Layers} title="No batches yet" description="Create a batch to group students into cohorts." actionLabel="Create Batch" onAction={() => setShowModal(true)} />
        ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filtered.map((batch, i) => (
            <div key={batch.id} className="card group animate-slide-up p-6" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-surface-900">{batch.title}</h3>
                    <span className={`badge text-[10px] ${statusStyles[batch.status]}`}>{batch.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-surface-500">{batch.course_title}</p>
                </div>
                <button onClick={() => handleDelete(batch.id, batch.title)} className="rounded-lg p-2 text-surface-400 opacity-0 transition-all hover:bg-red-50 hover:text-cta-500 group-hover:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-4">
                <div><p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-400"><Calendar className="h-3 w-3" /> Start</p><p className="mt-1 text-sm font-medium text-surface-700">{new Date(batch.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p></div>
                <div><p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-400"><Calendar className="h-3 w-3" /> End</p><p className="mt-1 text-sm font-medium text-surface-700">{new Date(batch.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p></div>
                <div><p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-400"><Users className="h-3 w-3" /> Students</p><p className="mt-1 text-sm font-medium text-surface-700">{batch.student_count} / {batch.max_students}</p></div>
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

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Batch">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Batch Title" required><FormInput required placeholder="e.g. January 2026 Cohort" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField label="Course">
            <FormSelect value={form.course_id} onChange={e => { const c = courses.find(x => x.id === e.target.value); setForm({ ...form, course_id: e.target.value, course_title: c?.title || '' }) }}>
              <option value="">Select a course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </FormSelect>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required><FormInput required type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></FormField>
            <FormField label="End Date" required><FormInput required type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></FormField>
          </div>
          <FormField label="Max Students"><FormInput type="number" min={1} value={form.max_students} onChange={e => setForm({ ...form, max_students: Number(e.target.value) })} /></FormField>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Create Batch" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
