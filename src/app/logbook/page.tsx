'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormSelect, FormTextarea, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { getFlightLog, getFlightLogSummary, createFlightLogEntry, deleteRecord } from '@/lib/data'
import { Plus, Search, Loader2, Plane, Clock, MapPin, Trash2, BookOpen } from 'lucide-react'

const flightTypeLabels: Record<string, string> = { training: 'Training', solo: 'Solo', pic: 'PIC', sic: 'SIC', dual: 'Dual', check_ride: 'Check Ride', simulator: 'Simulator', other: 'Other' }
const flightTypeColors: Record<string, string> = { training: 'badge-blue', solo: 'badge-green', pic: 'bg-violet-50 text-violet-700', sic: 'bg-sky-50 text-sky-600', dual: 'badge-amber', check_ride: 'badge-rose', simulator: 'bg-indigo-50 text-indigo-700', other: 'bg-surface-100 text-surface-500' }

export default function LogbookPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], aircraft_type: '', aircraft_registration: '',
    departure_location: '', arrival_location: '', flight_type: 'training',
    total_time: 1.0, pic_time: 0, sic_time: 0, dual_time: 0, solo_time: 0,
    instrument_time: 0, night_time: 0, cross_country_time: 0, simulator_time: 0,
    landings_day: 1, landings_night: 0, approaches: 0,
    instructor_name: '', instructor_endorsement: false, remarks: ''
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = async () => {
    if (!user) return
    const [e, s] = await Promise.all([getFlightLog(user.id), getFlightLogSummary(user.id)])
    setEntries(e); setSummary(s); setLoading(false)
  }
  useEffect(() => { if (user) load() }, [user])

  const filtered = entries.filter(e =>
    (e.aircraft_type || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.departure_location || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.arrival_location || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.remarks || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      await createFlightLogEntry({ ...form, user_id: user?.id })
      setToast({ message: 'Flight logged', type: 'success' }); setShowModal(false); load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  const currency90 = summary?.landings_last_90_days ?? 0
  const isCurrent = currency90 >= 3

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Flight Logbook" subtitle="Track flight hours, landings, and currency" />
      <div className="p-8">
        {/* Summary cards */}
        {summary && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-6">
            {[
              { label: 'Total Hours', value: Number(summary.total_hours).toFixed(1), color: '#0B3D91' },
              { label: 'PIC Hours', value: Number(summary.pic_hours).toFixed(1), color: '#28a745' },
              { label: 'Dual Hours', value: Number(summary.dual_hours).toFixed(1), color: '#ffc107' },
              { label: 'Night Hours', value: Number(summary.night_hours).toFixed(1), color: '#17a2b8' },
              { label: 'Sim Hours', value: Number(summary.sim_hours).toFixed(1), color: '#6f42c1' },
              { label: '90-Day Landings', value: currency90, color: isCurrent ? '#28a745' : '#dc3545' },
            ].map(s => (
              <div key={s.label} className="card p-4 text-center">
                <p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-surface-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Currency alert */}
        {summary && !isCurrent && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <Plane className="h-5 w-5 text-red-500" />
            <p className="text-sm text-red-700">Currency warning: You have only {currency90} landing(s) in the last 90 days. You need at least 3 to carry passengers (FAR 61.57).</p>
          </div>
        )}

        <div className="mb-6 flex items-center justify-between">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" /><input type="text" placeholder="Search flights..." value={search} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" /></div>
          <button onClick={() => { setForm({ ...form, date: new Date().toISOString().split('T')[0] }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-600 active:scale-[0.98]"><Plus className="h-4 w-4" /> Log Flight</button>
        </div>

        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : filtered.length === 0 && !search ? <EmptyState icon={BookOpen} title="No flights logged" description="Start logging your flight hours, landings, and training time." actionLabel="Log First Flight" onAction={() => setShowModal(true)} />
        : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-surface-100 bg-surface-50/50">
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Date</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Aircraft</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Route</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Type</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Total</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Landings</th>
              <th className="px-5 py-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr key={entry.id} className="animate-slide-up border-b border-surface-100 last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}>
                  <td className="px-5 py-3.5 text-sm font-medium text-surface-800">{new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-surface-800">{entry.aircraft_type || '—'}</p>
                    {entry.aircraft_registration && <p className="font-mono text-[11px] text-surface-400">{entry.aircraft_registration}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-surface-600">
                    {entry.departure_location || entry.arrival_location ? `${entry.departure_location || '?'} → ${entry.arrival_location || '?'}` : '—'}
                  </td>
                  <td className="px-5 py-3.5"><span className={`badge text-[10px] ${flightTypeColors[entry.flight_type] || 'bg-surface-100 text-surface-500'}`}>{flightTypeLabels[entry.flight_type] || entry.flight_type}</span></td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-surface-800">{Number(entry.total_time).toFixed(1)}h</td>
                  <td className="px-5 py-3.5 text-sm text-surface-600">{entry.landings_day + entry.landings_night}</td>
                  <td className="px-5 py-3.5"><button onClick={() => { if (confirm('Delete?')) deleteRecord('flight_log', entry.id).then(() => { setToast({ message: 'Deleted', type: 'success' }); load() }) }} className="rounded-lg p-1.5 text-surface-400 hover:bg-red-50 hover:text-cta-500"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Log Flight" width="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Date" required><FormInput required type="date" value={form.date} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, date: e.target.value })} /></FormField>
            <FormField label="Aircraft Type"><FormInput placeholder="e.g. C172" value={form.aircraft_type} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, aircraft_type: e.target.value })} /></FormField>
            <FormField label="Registration"><FormInput placeholder="e.g. N12345" value={form.aircraft_registration} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, aircraft_registration: e.target.value })} /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Departure"><FormInput placeholder="KJFK" value={form.departure_location} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, departure_location: e.target.value })} /></FormField>
            <FormField label="Arrival"><FormInput placeholder="KLGA" value={form.arrival_location} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, arrival_location: e.target.value })} /></FormField>
            <FormField label="Flight Type"><FormSelect value={form.flight_type} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, flight_type: e.target.value })}>{Object.entries(flightTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</FormSelect></FormField>
          </div>
          <p className="text-xs font-semibold text-surface-600 pt-2">Hours</p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { key: 'total_time', label: 'Total' }, { key: 'pic_time', label: 'PIC' },
              { key: 'dual_time', label: 'Dual' }, { key: 'solo_time', label: 'Solo' },
              { key: 'instrument_time', label: 'Instrument' }, { key: 'night_time', label: 'Night' },
              { key: 'cross_country_time', label: 'X-Country' }, { key: 'simulator_time', label: 'Simulator' },
            ].map(f => (
              <div key={f.key}>
                <label className="mb-1 block text-[10px] font-medium text-surface-500">{f.label}</label>
                <FormInput type="number" step="0.1" min="0" value={(form as any)[f.key]} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, [f.key]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
          <p className="text-xs font-semibold text-surface-600 pt-2">Landings & Approaches</p>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="mb-1 block text-[10px] font-medium text-surface-500">Day Landings</label><FormInput type="number" min="0" value={form.landings_day} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, landings_day: Number(e.target.value) })} /></div>
            <div><label className="mb-1 block text-[10px] font-medium text-surface-500">Night Landings</label><FormInput type="number" min="0" value={form.landings_night} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, landings_night: Number(e.target.value) })} /></div>
            <div><label className="mb-1 block text-[10px] font-medium text-surface-500">Approaches</label><FormInput type="number" min="0" value={form.approaches} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, approaches: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Instructor"><FormInput placeholder="Name" value={form.instructor_name} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, instructor_name: e.target.value })} /></FormField>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2.5"><input type="checkbox" checked={form.instructor_endorsement} onChange={e => setForm({ ...form, instructor_endorsement: e.target.checked })} className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500" /><span className="text-sm font-medium text-surface-700">Instructor Endorsement</span></label>
            </div>
          </div>
          <FormField label="Remarks"><FormTextarea rows={2} placeholder="Notes about this flight..." value={form.remarks} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, remarks: e.target.value })} /></FormField>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Log Flight" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
