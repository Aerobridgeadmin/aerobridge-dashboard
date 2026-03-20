'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormTextarea, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getDiscussions, getCourses, createDiscussion, deleteRecord } from '@/lib/data'
import { Discussion, Course } from '@/lib/supabase'
import { Plus, Search, MessageCircle, CheckCircle, Loader2, Trash2, MessageSquare } from 'lucide-react'
import { RoleVisible } from '@/components/RoleGuard'
import { supabase } from '@/lib/supabase'

export default function DiscussionsPage() {
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', author: '', course_id: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { Promise.all([getDiscussions(), getCourses()]).then(([d, c]) => { setDiscussions(d); setCourses(c); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const filtered = discussions.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.content.toLowerCase().includes(search.toLowerCase()) ||
    d.author.toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      await createDiscussion({ ...form, course_id: form.course_id || undefined })
      setToast({ message: 'Discussion posted', type: 'success' }); setShowModal(false); load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  const toggleResolved = async (d: Discussion) => {
    try {
      await supabase.from('discussions').update({ is_resolved: !d.is_resolved }).eq('id', d.id)
      setToast({ message: d.is_resolved ? 'Reopened' : 'Marked as resolved', type: 'success' })
      load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
  }

  const getCourseTitle = (courseId?: string) => {
    if (!courseId) return null
    return courses.find(c => c.id === courseId)?.title || null
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Discussions" subtitle="Course discussions and Q&A forum" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input type="text" placeholder="Search discussions..." value={search} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
            </div>
            <div className="flex items-center gap-3 text-xs text-surface-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success-500"></span>{discussions.filter(d => d.is_resolved).length} resolved</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500"></span>{discussions.filter(d => !d.is_resolved).length} open</span>
            </div>
          </div>
          <button onClick={() => { setForm({ title: '', content: '', author: '', course_id: '' }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]">
            <Plus className="h-4 w-4" /> New Discussion
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : filtered.length === 0 && !search ? (
          <EmptyState icon={MessageCircle} title="No discussions yet" description="Start a conversation to engage with students and instructors." actionLabel="Start Discussion" onAction={() => setShowModal(true)} />
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-surface-500">No results for &quot;{search}&quot;</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((disc, i) => {
              const courseTitle = getCourseTitle(disc.course_id)
              return (
                <div key={disc.id} className="card group animate-slide-up" style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}>
                  <div className="flex items-start gap-4 p-5">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${disc.is_resolved ? 'bg-success-50' : 'bg-brand-50'}`}>
                      {disc.is_resolved ? <CheckCircle className="h-5 w-5 text-success-500" /> : <MessageSquare className="h-5 w-5 text-brand-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-surface-800">{disc.title}</h3>
                        {disc.is_resolved && <span className="badge bg-success-50 text-[10px] text-success-500 ring-1 ring-success-500/20">Resolved</span>}
                        {courseTitle && <span className="badge badge-blue text-[10px]">{courseTitle}</span>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-surface-500">{disc.content}</p>
                      <div className="mt-3 flex items-center gap-4 text-[11px] text-surface-400">
                        <span>By <span className="font-medium text-surface-600">{disc.author}</span></span>
                        <span>{new Date(disc.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{disc.replies_count} replies</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => toggleResolved(disc)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${disc.is_resolved ? 'text-surface-500 hover:bg-surface-100' : 'text-success-500 hover:bg-success-50'}`}>
                        {disc.is_resolved ? 'Reopen' : 'Resolve'}
                      </button>
                      <button onClick={() => { if (confirm('Delete?')) deleteRecord('discussions', disc.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-2 text-surface-400 opacity-0 transition-all hover:bg-red-50 hover:text-cta-500 group-hover:opacity-100">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Discussion">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title" required>
            <FormInput required placeholder="What's your question or topic?" value={form.title} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, title: e.target.value })} />
          </FormField>
          <FormField label="Content" required>
            <FormTextarea required rows={4} placeholder="Describe your question or share your thoughts..." value={form.content} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, content: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Author" required>
              <FormInput required placeholder="Your name" value={form.author} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, author: e.target.value })} />
            </FormField>
            <FormField label="Course (optional)">
              <FormSelect value={form.course_id} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, course_id: e.target.value })}>
                <option value="">General</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </FormSelect>
            </FormField>
          </div>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Post Discussion" />
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
