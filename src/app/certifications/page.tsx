'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormSelect, FormTextarea, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { RoleVisible } from '@/components/RoleGuard'
import { useAuth } from '@/contexts/AuthContext'
import { getCertificationTypes, getUserCertifications, createUserCertification, createCertificationType, deleteRecord } from '@/lib/data'
import { Shield, Plus, Search, Loader2, AlertTriangle, CheckCircle, Clock, Trash2, FileText } from 'lucide-react'

const statusStyles: Record<string, string> = {
  active: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  expiring_soon: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  expired: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  pending: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  revoked: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
}
const statusIcons: Record<string, any> = { active: CheckCircle, expiring_soon: Clock, expired: AlertTriangle, pending: Clock, revoked: Shield }

export default function CertificationsPage() {
  const { user, isAdmin, isInstructor } = useAuth()
  const [certs, setCerts] = useState<any[]>([])
  const [certTypes, setCertTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ user_id: '', certification_type_id: '', certificate_number: '', issued_date: '', expiry_date: '', issuing_authority: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = async () => {
    const [c, t] = await Promise.all([
      isAdmin ? getUserCertifications() : getUserCertifications(user?.id),
      getCertificationTypes()
    ])
    setCerts(c); setCertTypes(t); setLoading(false)
  }
  useEffect(() => { if (user) load() }, [user])

  const filtered = certs.filter(c => {
    const matchSearch = (c.certification_types?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.certificate_number || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const counts = { all: certs.length, active: certs.filter(c => c.status === 'active').length, expiring_soon: certs.filter(c => c.status === 'expiring_soon').length, expired: certs.filter(c => c.status === 'expired').length }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const ct = certTypes.find((t: any) => t.id === form.certification_type_id)
      const payload: any = { ...form, user_id: form.user_id || user?.id }
      if (!payload.expiry_date && ct?.validity_months && form.issued_date) {
        const exp = new Date(form.issued_date)
        exp.setMonth(exp.getMonth() + ct.validity_months)
        payload.expiry_date = exp.toISOString().split('T')[0]
      }
      if (!payload.expiry_date) delete payload.expiry_date
      await createUserCertification(payload)
      setToast({ message: 'Certification added', type: 'success' }); setShowModal(false); load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  const daysUntil = (date: string) => { const d = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000); return d }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Certifications & Compliance" subtitle="Track licenses, ratings, and training compliance" />
      <div className="p-8">
        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total', value: counts.all, color: '#0B3D91', icon: Shield },
            { label: 'Active', value: counts.active, color: '#28a745', icon: CheckCircle },
            { label: 'Expiring Soon', value: counts.expiring_soon, color: '#ffc107', icon: Clock },
            { label: 'Expired', value: counts.expired, color: '#dc3545', icon: AlertTriangle },
          ].map(s => (
            <div key={s.label} className="card flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: s.color + '15' }}>
                <s.icon className="h-5 w-5" style={{ color: s.color }} />
              </div>
              <div><p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p><p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{s.label}</p></div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" /><input type="text" placeholder="Search certifications..." value={search} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" /></div>
            <div className="flex gap-1">
              {(['all', 'active', 'expiring_soon', 'expired'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${statusFilter === s ? 'bg-brand-500 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>
                  {s === 'all' ? 'All' : s === 'expiring_soon' ? 'Expiring' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <RoleVisible roles={['admin', 'instructor']}>
            <button onClick={() => { setForm({ user_id: '', certification_type_id: '', certificate_number: '', issued_date: new Date().toISOString().split('T')[0], expiry_date: '', issuing_authority: '', notes: '' }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-600 active:scale-[0.98]"><Plus className="h-4 w-4" /> Add Certification</button>
          </RoleVisible>
        </div>

        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : filtered.length === 0 && !search ? <EmptyState icon={Shield} title="No certifications tracked" description="Start tracking pilot licenses, medical certificates, and training compliance." actionLabel="Add Certification" onAction={() => setShowModal(true)} />
        : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-surface-100 bg-surface-50/50">
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Certification</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">ID / Number</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Issued</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Expires</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Status</th>
              <th className="px-6 py-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map((cert, i) => {
                const SIcon = statusIcons[cert.status] || Shield
                const days = cert.expiry_date ? daysUntil(cert.expiry_date) : null
                return (
                  <tr key={cert.id} className="animate-slide-up border-b border-surface-100 last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50"><FileText className="h-4 w-4 text-brand-500" /></div>
                        <div>
                          <p className="text-sm font-semibold text-surface-800">{cert.certification_types?.name || 'Unknown'}</p>
                          <p className="text-xs text-surface-500">{cert.certification_types?.authority} · {cert.certification_types?.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-surface-700">{cert.certificate_number || '—'}</td>
                    <td className="px-6 py-4 text-sm text-surface-600">{new Date(cert.issued_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-6 py-4">
                      {cert.expiry_date ? (
                        <div>
                          <p className="text-sm text-surface-700">{new Date(cert.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          {days !== null && <p className={`text-[10px] font-medium ${days < 0 ? 'text-red-500' : days < 30 ? 'text-amber-600' : 'text-surface-400'}`}>{days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}</p>}
                        </div>
                      ) : <span className="text-sm text-surface-400">No expiry</span>}
                    </td>
                    <td className="px-6 py-4"><span className={`badge text-[10px] ${statusStyles[cert.status]}`}><SIcon className="mr-1 inline h-3 w-3" />{cert.status.replace('_', ' ')}</span></td>
                    <td className="px-6 py-4">
                      <RoleVisible roles={['admin', 'instructor']}>
                        <button onClick={() => { if (confirm('Delete?')) deleteRecord('user_certifications', cert.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-1.5 text-surface-400 hover:bg-red-50 hover:text-cta-500"><Trash2 className="h-4 w-4" /></button>
                      </RoleVisible>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Certification" width="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Certification Type" required>
            <FormSelect required value={form.certification_type_id} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, certification_type_id: e.target.value })}>
              <option value="">Select type...</option>
              {certTypes.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.authority})</option>)}
            </FormSelect>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Certificate Number"><FormInput placeholder="e.g. 1234567" value={form.certificate_number} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, certificate_number: e.target.value })} /></FormField>
            <FormField label="Issuing Authority"><FormInput placeholder="e.g. FAA" value={form.issuing_authority} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, issuing_authority: e.target.value })} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Issue Date" required><FormInput required type="date" value={form.issued_date} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, issued_date: e.target.value })} /></FormField>
            <FormField label="Expiry Date"><FormInput type="date" value={form.expiry_date} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, expiry_date: e.target.value })} /><p className="mt-1 text-[10px] text-surface-400">Auto-calculated if left blank</p></FormField>
          </div>
          <FormField label="Notes"><FormTextarea rows={2} placeholder="Any additional notes..." value={form.notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, notes: e.target.value })} /></FormField>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Add Certification" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
