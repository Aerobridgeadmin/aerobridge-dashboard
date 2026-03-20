'use client'

import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getStudents, createStudent, deleteRecord, logActivity } from '@/lib/data'
import { Student } from '@/lib/supabase'
import { Plus, Search, Mail, Loader2, Users, Trash2, Video, CheckCircle2, CalendarDays, Clock } from 'lucide-react'
import RoleGuard from '@/components/RoleGuard'

const SERVICE_TYPES = [
  {
    id: 'free_consultation',
    label: 'Free 15-min Consultation',
    description: 'Schedule a free intro call via Google Meet',
    
    requiresSchedule: true,
  },
  {
    id: 'standard_enrollment',
    label: 'Standard Enrollment',
    description: 'Enroll student directly into courses',
    
    requiresSchedule: false,
  },
]

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    serviceType: 'free_consultation',
    consultationDate: '',
    consultationTime: '',
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [consultationResult, setConsultationResult] = useState<{
    meetLink: string; startTime: string; emailSent: boolean
  } | null>(null)

  const load = () => { getStudents().then(d => { setStudents(d); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  )

  const selectedService = SERVICE_TYPES.find(s => s.id === form.serviceType)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // 1. Create student record
      await createStudent({ name: form.name, email: form.email })
      await logActivity('enrollment', `New student "${form.name}" enrolled`)

      // 2. If free consultation — create Google Meet + send email
      if (form.serviceType === 'free_consultation') {
        if (!form.consultationDate || !form.consultationTime) {
          setToast({ message: 'Please select a date and time for the consultation', type: 'error' })
          setSaving(false)
          return
        }

        const res = await fetch('/api/create-consultation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentName: form.name,
            studentEmail: form.email,
            consultationDate: form.consultationDate,
            consultationTime: form.consultationTime,
          }),
        })
        const data = await res.json()

        if (!res.ok) throw new Error(data.error || 'Failed to create consultation')

        setConsultationResult({
          meetLink: data.meetLink,
          startTime: data.startTime,
          emailSent: data.emailSent,
        })
        setShowModal(false)
        setForm({ name: '', email: '', serviceType: 'free_consultation', consultationDate: '', consultationTime: '' })
        load()
      } else {
        setToast({ message: `Student "${form.name}" added successfully`, type: 'success' })
        setShowModal(false)
        setForm({ name: '', email: '', serviceType: 'free_consultation', consultationDate: '', consultationTime: '' })
        load()
      }
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to add student', type: 'error' })
    }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"?`)) return
    try {
      await deleteRecord('students', id)
      setToast({ message: 'Student removed', type: 'success' })
      load()
    } catch (err: any) {
      setToast({ message: err.message || 'Failed', type: 'error' })
    }
  }

  // Minimum date: today
  const today = new Date().toISOString().split('T')[0]

  return (
    <RoleGuard allowed={['admin', 'instructor']}>
    <div className="min-h-screen bg-surface-50">
      <Header title="Students" subtitle="Manage learner profiles and progress" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
          </div>
          <button onClick={() => { setForm({ name: '', email: '', serviceType: 'free_consultation', consultationDate: '', consultationTime: '' }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]">
            <Plus className="h-4 w-4" /> Add Student
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : filtered.length === 0 && !search ? (
          <EmptyState icon={Users} title="No students yet" description="Add your first student to start tracking progress." actionLabel="Add Student" onAction={() => setShowModal(true)} />
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-surface-500">No students match "{search}"</p>
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
                {filtered.map((student, i) => (
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
                      <button onClick={() => handleDelete(student.id, student.name)} className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-red-50 hover:text-cta-500"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Student Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Student">
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormField label="Full Name" required>
            <FormInput required placeholder="e.g. Juan Pérez" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Email" required>
            <FormInput required type="email" placeholder="student@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </FormField>

          {/* Service type selector */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-surface-600">Service Type</label>
            <div className="space-y-2">
              {SERVICE_TYPES.map(svc => (
                <label
                  key={svc.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition-all ${
                    form.serviceType === svc.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-surface-200 bg-white hover:border-surface-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="serviceType"
                    value={svc.id}
                    checked={form.serviceType === svc.id}
                    onChange={e => setForm({ ...form, serviceType: e.target.value })}
                    className="mt-0.5 h-4 w-4 accent-brand-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      
                      <span className={`text-sm font-semibold ${form.serviceType === svc.id ? 'text-brand-700' : 'text-surface-800'}`}>{svc.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-surface-500">{svc.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Date/time for consultation */}
          {selectedService?.requiresSchedule && (
            <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                <Video className="h-3.5 w-3.5" /> Google Meet will be created and invites sent automatically
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-surface-600">
                    <CalendarDays className="mr-1 inline h-3 w-3" />Date
                  </label>
                  <input
                    type="date"
                    required
                    min={today}
                    value={form.consultationDate}
                    onChange={e => setForm({ ...form, consultationDate: e.target.value })}
                    className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-surface-600">
                    <Clock className="mr-1 inline h-3 w-3" />Time
                  </label>
                  <input
                    type="time"
                    required
                    value={form.consultationTime}
                    onChange={e => setForm({ ...form, consultationTime: e.target.value })}
                    className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-surface-400">
                Student and admin@aerobridge.cl will receive calendar invites + a welcome email.
              </p>
            </div>
          )}

          <FormActions
            onCancel={() => setShowModal(false)}
            loading={saving}
            submitLabel={form.serviceType === 'free_consultation' ? 'Schedule & Add Student' : 'Add Student'}
          />
        </form>
      </Modal>

      {/* ── Consultation success overlay ── */}
      {consultationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="mb-1 text-lg font-bold text-surface-900">Consultation Scheduled!</h3>
            <p className="mb-5 text-sm text-surface-500">
              {consultationResult.emailSent
                ? 'A welcome email with the meeting details has been sent to the student.'
                : 'Student added. Configure SMTP in Settings to enable automatic emails.'}
            </p>

            <div className="mb-5 rounded-xl border border-surface-200 bg-surface-50 p-4 text-left">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-surface-400">Meeting details</p>
              <p className="text-sm font-semibold text-surface-800">
                {new Date(consultationResult.startTime).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-sm text-surface-600">
                {new Date(consultationResult.startTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} — 15 min
              </p>
              <a
                href={consultationResult.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
              >
                <Video className="h-4 w-4" /> Open Google Meet
              </a>
            </div>

            <button
              onClick={() => setConsultationResult(null)}
              className="w-full rounded-lg border border-surface-200 py-2.5 text-sm font-medium text-surface-600 hover:bg-surface-50"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
    </RoleGuard>
  )
}
