'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getAttendance, getEmployees, createAttendance, deleteRecord } from '@/lib/data'
import { Attendance, Employee } from '@/lib/supabase'
import { Search, Download, Clock, Loader2, Plus, Trash2 } from 'lucide-react'
import RoleGuard from '@/components/RoleGuard'

const statusStyles: Record<string, string> = { present: 'bg-green-50 text-green-700', absent: 'bg-red-50 text-red-600', late: 'bg-amber-50 text-amber-700', half_day: 'bg-orange-50 text-orange-600', remote: 'bg-blue-50 text-blue-600' }

export default function AttendancePage() {
  const [records, setRecords] = useState<Attendance[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ employee_id: '', employee_name: '', date: new Date().toISOString().split('T')[0], check_in: '09:00', check_out: '17:00', status: 'present' as const, hours_worked: 8 })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { Promise.all([getAttendance(), getEmployees()]).then(([a, e]) => { setRecords(a); setEmployees(e); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const summary = [
    { label: 'Present', value: records.filter(r => r.status === 'present').length, color: '#28a745' },
    { label: 'Remote', value: records.filter(r => r.status === 'remote').length, color: '#17a2b8' },
    { label: 'Late', value: records.filter(r => r.status === 'late').length, color: '#ffc107' },
    { label: 'Absent', value: records.filter(r => r.status === 'absent').length, color: '#dc3545' },
  ]

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const emp = employees.find(x => x.id === form.employee_id)
      await createAttendance({ ...form, employee_name: emp?.name || form.employee_name })
      setToast({ message: 'Attendance recorded', type: 'success' }); setShowModal(false); load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  return (
    <RoleGuard allowed={['admin']}>
    <div className="min-h-screen bg-surface-50">
      <Header title="Attendance" subtitle="Daily staff check-in and hours tracking" />
      <div className="p-8">
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summary.map(s => (
            <div key={s.label} className="card p-4 text-center">
              <p className="text-3xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-surface-500">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm font-medium text-surface-500">Today — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <button onClick={() => { setForm({ employee_id: '', employee_name: '', date: new Date().toISOString().split('T')[0], check_in: '09:00', check_out: '17:00', status: 'present', hours_worked: 8 }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-600 active:scale-[0.98]"><Plus className="h-4 w-4" /> Record</button>
        </div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : records.length === 0 ? <EmptyState icon={Clock} title="No attendance records" description="Start recording daily attendance." actionLabel="Record Attendance" onAction={() => setShowModal(true)} />
        : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-surface-100 bg-surface-50/50">
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Employee</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Date</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Check In</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Check Out</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Hours</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Status</th>
              <th className="px-6 py-3"></th>
            </tr></thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} className="animate-slide-up border-b border-surface-100 last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}>
                  <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-500">{r.employee_name.split(' ').map(n => n[0]).join('').slice(0,2)}</div><span className="text-sm font-medium text-surface-800">{r.employee_name}</span></div></td>
                  <td className="px-6 py-4 text-sm text-surface-600">{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-6 py-4 text-sm text-surface-600">{r.check_in || '—'}</td>
                  <td className="px-6 py-4 text-sm text-surface-600">{r.check_out || '—'}</td>
                  <td className="px-6 py-4 text-sm font-medium text-surface-700">{r.hours_worked > 0 ? `${r.hours_worked}h` : '—'}</td>
                  <td className="px-6 py-4"><span className={`badge text-[10px] ${statusStyles[r.status]}`}>{r.status.replace('_', ' ')}</span></td>
                  <td className="px-6 py-4"><button onClick={() => { if (confirm('Delete?')) deleteRecord('attendance', r.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-1.5 text-surface-400 hover:bg-red-50 hover:text-cta-500"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Record Attendance">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Employee" required>
            <FormSelect required value={form.employee_id} onChange={e => { const emp = employees.find(x => x.id === e.target.value); setForm({ ...form, employee_id: e.target.value, employee_name: emp?.name || '' }) }}>
              <option value="">Select employee...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Date"><FormInput type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Check In"><FormInput type="time" value={form.check_in} onChange={e => setForm({ ...form, check_in: e.target.value })} /></FormField>
            <FormField label="Check Out"><FormInput type="time" value={form.check_out} onChange={e => setForm({ ...form, check_out: e.target.value })} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status"><FormSelect value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}><option value="present">Present</option><option value="remote">Remote</option><option value="late">Late</option><option value="half_day">Half Day</option><option value="absent">Absent</option></FormSelect></FormField>
            <FormField label="Hours Worked"><FormInput type="number" min={0} max={24} step={0.5} value={form.hours_worked} onChange={e => setForm({ ...form, hours_worked: Number(e.target.value) })} /></FormField>
          </div>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Record" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
    </RoleGuard>
  )
}
