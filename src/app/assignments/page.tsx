'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormTextarea, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getAssignments, getCourses, createAssignment, deleteRecord } from '@/lib/data'
import { Assignment, Course } from '@/lib/supabase'
import { Plus, Search, FileText, Loader2, Trash2 } from 'lucide-react'
import { RoleVisible } from '@/components/RoleGuard'

const statusStyles: Record<string, string> = { active: 'bg-green-50 text-green-700 ring-1 ring-green-200', draft: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200', closed: 'bg-surface-100 text-surface-500 ring-1 ring-surface-200' }

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', course_id: '', course_title: '', description: '', due_date: '', max_score: 100, status: 'active' as const })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { Promise.all([getAssignments(), getCourses()]).then(([a, c]) => { setAssignments(a); setCourses(c); setLoading(false) }) }
  useEffect(() => { load() }, [])
  const filtered = assignments.filter(a => a.title.toLowerCase().includes(search.toLowerCase()))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try { const c = courses.find(x => x.id === form.course_id); await createAssignment({ ...form, course_title: c?.title || '' }); setToast({ message: 'Assignment created', type: 'success' }); setShowModal(false); load() }
    catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Assignments" subtitle="Track and manage coursework submissions" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" /><input type="text" placeholder="Search assignments..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" /></div>
          <RoleVisible roles={["admin", "instructor"]}><button onClick={() => { setForm({ title: '', course_id: '', course_title: '', description: '', due_date: '', max_score: 100, status: 'active' }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 active:scale-[0.98]"><Plus className="h-4 w-4" /> New Assignment</button></RoleVisible>
        </div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : filtered.length === 0 && !search ? <EmptyState icon={FileText} title="No assignments yet" description="Create assignments for your courses." actionLabel="New Assignment" onAction={() => setShowModal(true)} />
        : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-surface-100 bg-surface-50/50">
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Assignment</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Course</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Due Date</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Submissions</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Status</th>
              <th className="px-6 py-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={a.id} className="animate-slide-up border-b border-surface-100 last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}>
                  <td className="px-6 py-4"><div className="flex items-center gap-3"><FileText className="h-4 w-4 text-brand-500" /><div><p className="text-sm font-semibold text-surface-800">{a.title}</p><p className="text-xs text-surface-500">Max score: {a.max_score}</p></div></div></td>
                  <td className="px-6 py-4 text-sm text-surface-600">{a.course_title || '—'}</td>
                  <td className="px-6 py-4 text-sm text-surface-600">{a.due_date ? new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
                  <td className="px-6 py-4"><span className="text-sm font-semibold text-surface-700">{a.submissions_count}</span></td>
                  <td className="px-6 py-4"><span className={`badge text-[10px] ${statusStyles[a.status]}`}>{a.status}</span></td>
                  <td className="px-6 py-4"><button onClick={() => { if (confirm('Delete?')) deleteRecord('assignments', a.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-1.5 text-surface-400 hover:bg-red-50 hover:text-cta-500"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Assignment">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title" required><FormInput required placeholder="Assignment title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField label="Course"><FormSelect value={form.course_id} onChange={(e) => { const c = courses.find(x => x.id === e.target.value); setForm({ ...form, course_id: e.target.value, course_title: c?.title || '' }) }}><option value="">Select course...</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</FormSelect></FormField>
          <FormField label="Description"><FormTextarea rows={2} placeholder="Instructions..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Due Date"><FormInput type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></FormField>
            <FormField label="Max Score"><FormInput type="number" min={1} value={form.max_score} onChange={(e) => setForm({ ...form, max_score: Number(e.target.value) })} /></FormField>
          </div>
          <FormField label="Status"><FormSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}><option value="active">Active</option><option value="draft">Draft</option></FormSelect></FormField>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Create" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
