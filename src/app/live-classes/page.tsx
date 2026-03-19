'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getLiveClasses, createLiveClass, deleteRecord } from '@/lib/data'
import { LiveClass } from '@/lib/supabase'
import { Plus, Search, Video, Clock, ExternalLink, Loader2, Trash2 } from 'lucide-react'
import { RoleVisible } from '@/components/RoleGuard'

const statusStyles: Record<string, string> = { live: 'bg-red-50 text-red-600 ring-1 ring-red-200', scheduled: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', completed: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200', cancelled: 'bg-orange-50 text-orange-600 ring-1 ring-orange-200' }

export default function LiveClassesPage() {
  const [classes, setClasses] = useState<LiveClass[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', instructor: '', start_time: '', duration_minutes: 60, max_attendees: 50, meeting_link: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { getLiveClasses().then(d => { setClasses(d); setLoading(false) }) }
  useEffect(() => { load() }, [])
  const filtered = classes.filter(c => c.title.toLowerCase().includes(search.toLowerCase()) || c.instructor.toLowerCase().includes(search.toLowerCase()))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try { await createLiveClass(form); setToast({ message: 'Class scheduled', type: 'success' }); setShowModal(false); load() }
    catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Live Classes" subtitle="Schedule and manage virtual classroom sessions" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" /><input type="text" placeholder="Search classes..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" /></div>
          <RoleVisible roles={["admin", "instructor"]}><button onClick={() => { setForm({ title: '', instructor: '', start_time: '', duration_minutes: 60, max_attendees: 50, meeting_link: '' }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]" style={{ backgroundColor: '#D64541' }}><Plus className="h-4 w-4" /> Schedule Class</button></RoleVisible>
        </div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : filtered.length === 0 && !search ? <EmptyState icon={Video} title="No live classes yet" description="Schedule your first virtual class session." actionLabel="Schedule Class" onAction={() => setShowModal(true)} />
        : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cls, i) => (
            <div key={cls.id} className="card group animate-slide-up p-5" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${cls.status === 'live' ? 'bg-red-50' : 'bg-brand-50'}`}><Video className={`h-5 w-5 ${cls.status === 'live' ? 'text-red-500' : 'text-brand-500'}`} /></div>
                  <div><h3 className="text-sm font-bold text-surface-800">{cls.title}</h3><p className="text-xs text-surface-500">{cls.batch_title || 'No batch'}</p></div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`badge text-[10px] ${statusStyles[cls.status]}`}>{cls.status === 'live' ? '● LIVE' : cls.status}</span>
                  <button onClick={() => { if (confirm('Delete?')) deleteRecord('live_classes', cls.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-1 text-surface-400 opacity-0 hover:bg-red-50 hover:text-cta-500 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                <div><p className="text-surface-400">Instructor</p><p className="mt-0.5 font-medium text-surface-700">{cls.instructor}</p></div>
                <div><p className="text-surface-400">Duration</p><p className="mt-0.5 font-medium text-surface-700">{cls.duration_minutes}m</p></div>
                <div><p className="text-surface-400">Attendees</p><p className="mt-0.5 font-medium text-surface-700">{cls.attendees}/{cls.max_attendees}</p></div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-surface-100 pt-3">
                <span className="flex items-center gap-1 text-xs text-surface-500"><Clock className="h-3 w-3" />{new Date(cls.start_time).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {cls.meeting_link && cls.status !== 'completed' && cls.status !== 'cancelled' && (
                  <a href={cls.meeting_link} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs font-semibold text-brand-500 hover:text-brand-600"><ExternalLink className="h-3 w-3" /> Join</a>
                )}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Schedule Live Class">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Class Title" required><FormInput required placeholder="e.g. Drone Navigation Workshop" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField label="Instructor" required><FormInput required placeholder="Instructor name" value={form.instructor} onChange={e => setForm({ ...form, instructor: e.target.value })} /></FormField>
          <FormField label="Start Time" required><FormInput required type="datetime-local" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Duration (min)"><FormInput type="number" min={15} value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></FormField>
            <FormField label="Max Attendees"><FormInput type="number" min={1} value={form.max_attendees} onChange={e => setForm({ ...form, max_attendees: Number(e.target.value) })} /></FormField>
          </div>
          <FormField label="Meeting Link"><FormInput type="url" placeholder="https://zoom.us/..." value={form.meeting_link} onChange={e => setForm({ ...form, meeting_link: e.target.value })} /></FormField>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Schedule" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
