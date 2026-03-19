'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getEmployees, createEmployee, deleteRecord } from '@/lib/data'
import { Employee } from '@/lib/supabase'
import { Plus, Search, Mail, Phone, Loader2, UserCog, Trash2 } from 'lucide-react'
import RoleGuard from '@/components/RoleGuard'

const statusStyles: Record<string, string> = { active: 'bg-green-50 text-green-700', on_leave: 'bg-amber-50 text-amber-700', inactive: 'bg-gray-100 text-gray-500' }

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: '', department: '', phone: '', join_date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { getEmployees().then(d => { setEmployees(d); setLoading(false) }) }
  useEffect(() => { load() }, [])
  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.role.toLowerCase().includes(search.toLowerCase()) || e.department.toLowerCase().includes(search.toLowerCase()))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try { await createEmployee(form); setToast({ message: 'Staff member added', type: 'success' }); setShowModal(false); load() }
    catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  return (
    <RoleGuard allowed={['admin']}>
    <div className="min-h-screen bg-surface-50">
      <Header title="Staff" subtitle="Manage instructors, coordinators, and administrators" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" /><input type="text" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" /></div>
          <button onClick={() => { setForm({ name: '', email: '', role: '', department: '', phone: '', join_date: new Date().toISOString().split('T')[0] }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 active:scale-[0.98]"><Plus className="h-4 w-4" /> Add Staff</button>
        </div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : filtered.length === 0 && !search ? <EmptyState icon={UserCog} title="No staff yet" description="Add instructors and team members." actionLabel="Add Staff" onAction={() => setShowModal(true)} />
        : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((emp, i) => (
            <div key={emp.id} className="card group animate-slide-up p-5" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: '#0B3D91' }}>{emp.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                  <div><h3 className="text-sm font-bold text-surface-800">{emp.name}</h3><p className="text-xs text-surface-500">{emp.role}</p></div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`badge text-[10px] ${statusStyles[emp.status]}`}>{emp.status.replace('_', ' ')}</span>
                  <button onClick={() => { if (confirm('Remove?')) deleteRecord('employees', emp.id).then(() => { setToast({ message: 'Removed', type: 'success' }); load() }) }} className="rounded-lg p-1 text-surface-400 opacity-0 hover:bg-red-50 hover:text-cta-500 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t border-surface-100 pt-4 text-xs">
                <div className="flex items-center justify-between"><span className="text-surface-400">Department</span><span className="font-medium text-surface-700">{emp.department}</span></div>
                <div className="flex items-center justify-between"><span className="text-surface-400">Joined</span><span className="font-medium text-surface-700">{new Date(emp.join_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
              </div>
              <div className="mt-4 flex gap-2">
                <a href={`mailto:${emp.email}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-surface-200 py-2 text-xs font-medium text-surface-600 hover:bg-surface-50"><Mail className="h-3 w-3" />Email</a>
                {emp.phone && <a href={`tel:${emp.phone}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-surface-200 py-2 text-xs font-medium text-surface-600 hover:bg-surface-50"><Phone className="h-3 w-3" />Call</a>}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Staff Member">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Full Name" required><FormInput required placeholder="e.g. Jane Smith" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Email" required><FormInput required type="email" placeholder="email@company.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Role" required><FormInput required placeholder="e.g. Instructor" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></FormField>
            <FormField label="Department" required><FormInput required placeholder="e.g. Training" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Phone"><FormInput type="tel" placeholder="+1 234 567 890" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></FormField>
            <FormField label="Join Date"><FormInput type="date" value={form.join_date} onChange={e => setForm({ ...form, join_date: e.target.value })} /></FormField>
          </div>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Add" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
    </RoleGuard>
  )
}
