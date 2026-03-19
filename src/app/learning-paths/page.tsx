'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormTextarea, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { RoleVisible } from '@/components/RoleGuard'
import { useAuth } from '@/contexts/AuthContext'
import { getLearningPaths, getCourses, createLearningPath, deleteRecord } from '@/lib/data'
import { Plus, Search, Loader2, Route, BookOpen, Clock, Users, Trash2, Lock, CheckCircle, ArrowRight } from 'lucide-react'

const roleLabels: Record<string, string> = { pilot: 'Pilots', drone_operator: 'Drone Operators', maintenance: 'Maintenance', crew: 'Crew', all: 'All Roles' }

export default function LearningPathsPage() {
  const { user, isAdmin, isInstructor } = useAuth()
  const [paths, setPaths] = useState<any[]>([])
  const [courses, setCourses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: 'aviation', target_role: 'all', estimated_hours: 0, published: false })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = async () => { const [p, c] = await Promise.all([getLearningPaths(), getCourses()]); setPaths(p); setCourses(c); setLoading(false) }
  useEffect(() => { load() }, [])

  const filtered = paths.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase()))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      await createLearningPath({ ...form, created_by: user?.id })
      setToast({ message: 'Learning path created', type: 'success' }); setShowModal(false); load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  const pathColors = ['from-brand-500 to-brand-700', 'from-emerald-500 to-emerald-700', 'from-violet-500 to-violet-700', 'from-amber-500 to-amber-700', 'from-cyan-500 to-cyan-700', 'from-rose-500 to-rose-700']

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Learning Paths" subtitle="Structured course sequences with prerequisites" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" /><input type="text" placeholder="Search paths..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" /></div>
          <RoleVisible roles={['admin', 'instructor']}>
            <button onClick={() => { setForm({ title: '', description: '', category: 'aviation', target_role: 'all', estimated_hours: 0, published: false }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-600 active:scale-[0.98]"><Plus className="h-4 w-4" /> Create Path</button>
          </RoleVisible>
        </div>

        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : filtered.length === 0 && !search ? <EmptyState icon={Route} title="No learning paths yet" description="Create structured course sequences for pilot training, drone certification, and more." actionLabel="Create Path" onAction={() => setShowModal(true)} />
        : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((path, i) => (
            <div key={path.id} className="card group animate-slide-up overflow-hidden" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
              <div className={`h-2 bg-gradient-to-r ${pathColors[i % pathColors.length]}`} />
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-surface-900">{path.title}</h3>
                      {!path.published && <span className="badge bg-surface-100 text-[10px] text-surface-500">Draft</span>}
                    </div>
                    {path.description && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-surface-500">{path.description}</p>}
                  </div>
                  <RoleVisible roles={['admin', 'instructor']}>
                    <button onClick={() => { if (confirm('Delete?')) deleteRecord('learning_paths', path.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-1.5 text-surface-400 opacity-0 hover:bg-red-50 hover:text-cta-500 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                  </RoleVisible>
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-surface-500">
                  <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{path.course_count} courses</span>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{path.estimated_hours}h</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{roleLabels[path.target_role] || path.target_role}</span>
                </div>
                {/* Visual path representation */}
                <div className="mt-4 flex items-center gap-1.5">
                  {Array.from({ length: Math.min(path.course_count || 3, 6) }).map((_, j) => (
                    <div key={j} className="flex items-center gap-1.5">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${j === 0 ? 'bg-brand-500 text-white' : 'bg-surface-200 text-surface-500'}`}>{j + 1}</div>
                      {j < Math.min(path.course_count || 3, 6) - 1 && <ArrowRight className="h-3 w-3 text-surface-300" />}
                    </div>
                  ))}
                  {(path.course_count || 0) > 6 && <span className="text-[10px] text-surface-400">+{path.course_count - 6}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Learning Path">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Path Title" required><FormInput required placeholder="e.g. Part 107 Drone Pilot Certification" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField label="Description"><FormTextarea rows={3} placeholder="What will learners achieve..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Target Role"><FormSelect value={form.target_role} onChange={e => setForm({ ...form, target_role: e.target.value })}>{Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</FormSelect></FormField>
            <FormField label="Estimated Hours"><FormInput type="number" min={0} value={form.estimated_hours} onChange={e => setForm({ ...form, estimated_hours: Number(e.target.value) })} /></FormField>
          </div>
          <label className="flex items-center gap-2.5 pt-1"><input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500" /><span className="text-sm font-medium text-surface-700">Publish immediately</span></label>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Create Path" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
