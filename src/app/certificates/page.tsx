'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getCertificates, createCertificate, deleteRecord, logActivity } from '@/lib/data'
import { Certificate } from '@/lib/supabase'
import { Search, Download, Award, Copy, Loader2, Plus, Trash2, ExternalLink } from 'lucide-react'
import { RoleVisible } from '@/components/RoleGuard'

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ student_name: '', course_title: '', certificate_id: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { getCertificates().then(d => { setCertificates(d); setLoading(false) }) }
  useEffect(() => { load() }, [])
  const filtered = certificates.filter(c => c.student_name.toLowerCase().includes(search.toLowerCase()) || c.course_title.toLowerCase().includes(search.toLowerCase()) || c.certificate_id.toLowerCase().includes(search.toLowerCase()))

  const generateId = () => `AB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const certId = form.certificate_id || generateId()
      await createCertificate({ ...form, certificate_id: certId })
      await logActivity('certificate', `Certificate issued to ${form.student_name}`)
      setToast({ message: 'Certificate issued', type: 'success' }); setShowModal(false); load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Certificates" subtitle="View and manage issued certificates" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" /><input type="text" placeholder="Search certificates..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" /></div>
          <RoleVisible roles={['admin', 'instructor']}><button onClick={() => { setForm({ student_name: '', course_title: '', certificate_id: '' }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]"><Plus className="h-4 w-4" /> Issue Certificate</button></RoleVisible>
        </div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : filtered.length === 0 && !search ? <EmptyState icon={Award} title="No certificates yet" description="Issue certificates when students complete courses." actionLabel="Issue Certificate" onAction={() => setShowModal(true)} />
        : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-surface-100 bg-surface-50/50">
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Certificate ID</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Student</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Course</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Issued Date</th>
              <th className="px-6 py-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map((cert, i) => (
                <tr key={cert.id} className="animate-slide-up border-b border-surface-100 transition-colors last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}>
                  <td className="px-6 py-4"><div className="flex items-center gap-2"><Award className="h-4 w-4 text-warning-500" /><span className="font-mono text-sm font-medium text-surface-800">{cert.certificate_id}</span></div></td>
                  <td className="px-6 py-4"><div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-semibold text-white">{cert.student_name.split(' ').map(n => n[0]).join('')}</div><span className="text-sm font-medium text-surface-900">{cert.student_name}</span></div></td>
                  <td className="px-6 py-4 text-sm text-surface-600">{cert.course_title}</td>
                  <td className="px-6 py-4 text-sm text-surface-500">{new Date(cert.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { navigator.clipboard.writeText(cert.certificate_id); setToast({ message: 'Certificate ID copied', type: 'success' }) }} className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600" title="Copy ID"><Copy className="h-3.5 w-3.5" /></button>
                      <button className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600" title="Download"><Download className="h-3.5 w-3.5" /></button>
                      <button className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600" title="View"><ExternalLink className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (confirm('Delete?')) deleteRecord('certificates', cert.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-red-50 hover:text-cta-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Issue Certificate">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Student Name" required><FormInput required placeholder="Full name" value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value })} /></FormField>
          <FormField label="Course Title" required><FormInput required placeholder="Course name" value={form.course_title} onChange={e => setForm({ ...form, course_title: e.target.value })} /></FormField>
          <FormField label="Certificate ID"><FormInput placeholder="Auto-generated if empty" value={form.certificate_id} onChange={e => setForm({ ...form, certificate_id: e.target.value })} /></FormField>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Issue" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
