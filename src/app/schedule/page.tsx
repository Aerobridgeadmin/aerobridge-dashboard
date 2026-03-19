'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormTextarea, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getSchedule, createScheduleEvent, deleteRecord } from '@/lib/data'
import { ScheduleEvent } from '@/lib/supabase'
import { Plus, MapPin, Users, Clock, Loader2, CalendarDays, Trash2 } from 'lucide-react'
import { RoleVisible } from '@/components/RoleGuard'

const typeColors: Record<string, { bg: string; dot: string; text: string }> = {
  class: { bg: 'bg-blue-50', dot: 'bg-blue-500', text: 'text-blue-700' },
  meeting: { bg: 'bg-green-50', dot: 'bg-green-500', text: 'text-green-700' },
  deadline: { bg: 'bg-red-50', dot: 'bg-red-500', text: 'text-red-700' },
  event: { bg: 'bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-700' },
  review: { bg: 'bg-violet-50', dot: 'bg-violet-500', text: 'text-violet-700' },
}

export default function SchedulePage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', type: 'class' as const, start_time: '', end_time: '', location: '', description: '', attendees_count: 0, color: 'blue' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { getSchedule().then(d => { setEvents(d); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const grouped = events.reduce<Record<string, ScheduleEvent[]>>((acc, ev) => {
    const dateKey = new Date(ev.start_time).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(ev)
    return acc
  }, {})

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try { await createScheduleEvent(form); setToast({ message: 'Event added', type: 'success' }); setShowModal(false); load() }
    catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Schedule" subtitle="Classes, meetings, deadlines, and events" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            {Object.entries(typeColors).map(([t, c]) => <span key={t} className="flex items-center gap-1.5 text-xs font-medium text-surface-600"><span className={`h-2 w-2 rounded-full ${c.dot}`}></span>{t}</span>)}
          </div>
          <RoleVisible roles={["admin", "instructor"]}><button onClick={() => { setForm({ title: '', type: 'class', start_time: '', end_time: '', location: '', description: '', attendees_count: 0, color: 'blue' }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.98]" style={{ backgroundColor: '#D64541' }}><Plus className="h-4 w-4" /> Add Event</button></RoleVisible>
        </div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : events.length === 0 ? <EmptyState icon={CalendarDays} title="No events scheduled" description="Add classes, meetings, and deadlines to your calendar." actionLabel="Add Event" onAction={() => setShowModal(true)} />
        : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([date, dayEvents]) => (
            <div key={date}>
              <h3 className="mb-3 text-sm font-bold text-surface-800">{date}</h3>
              <div className="space-y-3">
                {dayEvents.map((ev, i) => {
                  const c = typeColors[ev.type] || typeColors.class
                  const time = new Date(ev.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                  const endTime = ev.end_time ? new Date(ev.end_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null
                  return (
                    <div key={ev.id} className="card group animate-slide-up flex items-stretch overflow-hidden" style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}>
                      <div className={`w-1 shrink-0 ${c.dot}`}></div>
                      <div className="flex flex-1 items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                          <div className="text-center" style={{ minWidth: '56px' }}><p className="text-sm font-bold text-surface-800">{time}</p>{endTime && <p className="text-[10px] text-surface-400">{endTime}</p>}</div>
                          <div>
                            <p className="text-sm font-semibold text-surface-800">{ev.title}</p>
                            <div className="mt-1 flex items-center gap-3 text-xs text-surface-500">
                              <span className={`badge text-[10px] ${c.bg} ${c.text}`}>{ev.type}</span>
                              {ev.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</span>}
                              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{ev.attendees_count}</span>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => { if (confirm('Delete?')) deleteRecord('schedule', ev.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-2 text-surface-400 opacity-0 hover:bg-red-50 hover:text-cta-500 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Event">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title" required><FormInput required placeholder="Event title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type"><FormSelect value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}><option value="class">Class</option><option value="meeting">Meeting</option><option value="deadline">Deadline</option><option value="event">Event</option><option value="review">Review</option></FormSelect></FormField>
            <FormField label="Location"><FormInput placeholder="Room / Link" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start" required><FormInput required type="datetime-local" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></FormField>
            <FormField label="End"><FormInput type="datetime-local" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></FormField>
          </div>
          <FormField label="Attendees"><FormInput type="number" min={0} value={form.attendees_count} onChange={e => setForm({ ...form, attendees_count: Number(e.target.value) })} /></FormField>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Add Event" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
