'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormTextarea, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getAnnouncements, getCourses, createAnnouncement, deleteRecord } from '@/lib/data'
import { Announcement, Course } from '@/lib/supabase'
import { Plus, Search, Megaphone, Pin, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { RoleVisible } from '@/components/RoleGuard'

const priorityStyles: Record<string, string> = {
  low: 'bg-surface-100 text-surface-500',
  normal: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-600',
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', author: '', course_id: '', priority: 'normal' as const, pinned: false })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { Promise.all([getAnnouncements(), getCourses()]).then(([a, c]) => { setAnnouncements(a); setCourses(c); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const filtered = announcements.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.content.toLowerCase().includes(search.toLowerCase()) ||
    a.author.toLowerCase().includes(search.toLowerCase())
  )

  // Sort: pinned first, then by date
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      await createAnnouncement({ ...form, course_id: form.course_id || undefined })
      setToast({ message: 'Announcement published', type: 'success' }); setShowModal(false); load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Announcements" subtitle="Broadcast updates to students and staff" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search announcements..." value={search} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
          </div>
          <RoleVisible roles={['admin', 'instructor']}>
          <button onClick={() => { setForm({ title: '', content: '', author: '', course_id: '', priority: 'normal', pinned: false }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]" style={{ backgroundColor: '#D64541' }}>
            <Plus className="h-4 w-4" /> New Announcement
          </button>
          </RoleVisible>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : sorted.length === 0 && !search ? (
          <EmptyState icon={Megaphone} title="No announcements yet" description="Publish announcements to keep students and staff informed." actionLabel="New Announcement" onAction={() => setShowModal(true)} />
        ) : sorted.length === 0 ? (
          <p className="py-12 text-center text-sm text-surface-500">No results for &quot;{search}&quot;</p>
        ) : (
          <div className="space-y-4">
            {sorted.map((ann, i) => (
              <div key={ann.id} className="card group animate-slide-up overflow-hidden" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}>
                <div className="flex items-stretch">
                  {/* Priority stripe */}
                  <div className={`w-1 shrink-0 ${ann.priority === 'urgent' ? 'bg-red-500' : ann.priority === 'high' ? 'bg-amber-500' : ann.priority === 'normal' ? 'bg-blue-500' : 'bg-surface-300'}`}></div>

                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ann.priority === 'urgent' ? 'bg-red-50' : 'bg-brand-50'}`}>
                          {ann.priority === 'urgent' ? <AlertTriangle className="h-4.5 w-4.5 text-red-500" /> : <Megaphone className="h-4.5 w-4.5 text-brand-500" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-surface-800">{ann.title}</h3>
                            {ann.pinned && <Pin className="h-3.5 w-3.5 text-brand-500" />}
                            <span className={`badge text-[10px] ${priorityStyles[ann.priority]}`}>{ann.priority}</span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-surface-600">{ann.content}</p>
                          <div className="mt-3 flex items-center gap-4 text-[11px] text-surface-400">
                            <span>By <span className="font-medium text-surface-600">{ann.author}</span></span>
                            <span>{new Date(ann.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            {ann.course_id && <span className="badge badge-blue text-[10px]">Course-specific</span>}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => { if (confirm('Delete this announcement?')) deleteRecord('announcements', ann.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-2 text-surface-400 opacity-0 transition-all hover:bg-red-50 hover:text-cta-500 group-hover:opacity-100">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Announcement">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title" required>
            <FormInput required placeholder="Announcement title" value={form.title} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, title: e.target.value })} />
          </FormField>
          <FormField label="Content" required>
            <FormTextarea required rows={4} placeholder="Write your announcement..." value={form.content} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, content: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Author" required>
              <FormInput required placeholder="Your name" value={form.author} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, author: e.target.value })} />
            </FormField>
            <FormField label="Priority">
              <FormSelect value={form.priority} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, priority: e.target.value as any })}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </FormSelect>
            </FormField>
          </div>
          <FormField label="Course (optional)">
            <FormSelect value={form.course_id} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, course_id: e.target.value })}>
              <option value="">All — General announcement</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </FormSelect>
          </FormField>
          <label className="flex items-center gap-2.5 pt-1">
            <input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm font-medium text-surface-700">Pin to top</span>
          </label>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Publish" />
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
