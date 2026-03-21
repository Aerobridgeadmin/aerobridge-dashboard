'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/Header'
import Modal from '@/components/Modal'
import Pagination from '@/components/Pagination'
import Toast from '@/components/Toast'
import { getLeads, updateLead, deleteRecord } from '@/lib/data'
import { Lead } from '@/lib/supabase'
import RoleGuard from '@/components/RoleGuard'
import {
  Target, Search, Filter, MoreHorizontal, Mail, Phone, Video,
  Calendar, Clock, CheckCircle2, XCircle, UserCheck, AlertCircle,
  ExternalLink, Loader2, Trash2, StickyNote, TrendingUp, Users, CalendarCheck
} from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  new:        { label: 'New',       color: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',    icon: AlertCircle },
  scheduled:  { label: 'Scheduled', color: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', icon: Calendar },
  completed:  { label: 'Completed', color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', icon: CheckCircle2 },
  no_show:    { label: 'No Show',   color: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',    icon: XCircle },
  converted:  { label: 'Converted', color: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', icon: UserCheck },
  cancelled:  { label: 'Cancelled', color: 'bg-surface-100 text-surface-500 ring-1 ring-surface-200', icon: XCircle },
}

const INTEREST_LABELS: Record<string, string> = {
  'Inglés General': 'English General',
  'FAA PPL': 'FAA PPL',
  'FAA IFR/CPL': 'FAA IFR/CPL',
  'FAA ATP': 'FAA ATP',
  'ICAO English': 'ICAO English',
  'Asesoria Escuelas': 'Flight School Advisory',
  'Paquete Combinado': 'Combo Package',
  'Otro': 'Other',
  'general': 'General',
}

const ITEMS_PER_PAGE = 15

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesText, setNotesText] = useState('')

  const fetchLeads = useCallback(async () => {
    try {
      const data = await getLeads()
      setLeads(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const filtered = leads.filter(l => {
    const matchesSearch = !search || 
      l.name?.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.phone?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  // Stats
  const totalLeads = leads.length
  const scheduledCount = leads.filter(l => l.status === 'scheduled').length
  const convertedCount = leads.filter(l => l.status === 'converted').length
  const conversionRate = totalLeads > 0 ? Math.round((convertedCount / totalLeads) * 100) : 0

  async function handleStatusChange(lead: Lead, newStatus: string) {
    setUpdatingStatus(lead.id)
    try {
      await updateLead(lead.id, { status: newStatus as Lead['status'] })
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus as Lead['status'] } : l))
      setToast({ message: `Lead status updated to ${STATUS_CONFIG[newStatus]?.label}`, type: 'success' })
      if (selectedLead?.id === lead.id) setSelectedLead({ ...lead, status: newStatus as Lead['status'] })
    } catch {
      setToast({ message: 'Failed to update status', type: 'error' })
    } finally {
      setUpdatingStatus(null)
    }
  }

  async function handleSaveNotes() {
    if (!selectedLead) return
    try {
      await updateLead(selectedLead.id, { notes: notesText })
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, notes: notesText } : l))
      setSelectedLead({ ...selectedLead, notes: notesText })
      setNotesOpen(false)
      setToast({ message: 'Notes saved', type: 'success' })
    } catch {
      setToast({ message: 'Failed to save notes', type: 'error' })
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this lead permanently?')) return
    try {
      await deleteRecord('leads', id)
      setLeads(prev => prev.filter(l => l.id !== id))
      setDetailOpen(false)
      setToast({ message: 'Lead deleted', type: 'success' })
    } catch {
      setToast({ message: 'Failed to delete lead', type: 'error' })
    }
  }

  function formatDate(d?: string) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  function formatTime(d?: string) {
    if (!d) return ''
    return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  }
  function formatRelative(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return formatDate(d)
  }

  return (
    <RoleGuard allowed={['admin']}>
    <div className="min-h-screen bg-surface-50">
      <Header title="Leads" subtitle="Free consultation pipeline — website bookings & conversions" />

      <div className="p-8">
        {/* Stats Row */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Target className="h-5 w-5" /></div>
              <div><p className="text-xs font-medium text-surface-500">Total Leads</p><p className="text-2xl font-bold text-surface-900">{totalLeads}</p></div>
            </div>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><CalendarCheck className="h-5 w-5" /></div>
              <div><p className="text-xs font-medium text-surface-500">Scheduled</p><p className="text-2xl font-bold text-surface-900">{scheduledCount}</p></div>
            </div>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600"><UserCheck className="h-5 w-5" /></div>
              <div><p className="text-xs font-medium text-surface-500">Converted</p><p className="text-2xl font-bold text-surface-900">{convertedCount}</p></div>
            </div>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><TrendingUp className="h-5 w-5" /></div>
              <div><p className="text-xs font-medium text-surface-500">Conversion Rate</p><p className="text-2xl font-bold text-surface-900">{conversionRate}%</p></div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search by name, email, or phone..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="h-10 w-full max-w-sm rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-100" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-surface-400" />
            {['all', 'new', 'scheduled', 'completed', 'converted', 'no_show', 'cancelled'].map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${statusFilter === s ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-surface-600 ring-1 ring-surface-200 hover:bg-surface-50'}`}>
                {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label}
                {s !== 'all' && <span className="ml-1 opacity-70">({leads.filter(l => l.status === s).length})</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-300 bg-white py-16">
            <Target className="mb-3 h-12 w-12 text-surface-300" />
            <p className="text-lg font-semibold text-surface-600">No leads yet</p>
            <p className="mt-1 text-sm text-surface-400">Leads will appear here when visitors book a consultation on your website.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50/80">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Lead</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Interest</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Consultation</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Source</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Received</th>
                  <th className="w-10 px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {paginated.map(lead => {
                  const sc = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new
                  const StatusIcon = sc.icon
                  return (
                    <tr key={lead.id} className="group transition-colors hover:bg-surface-50/60 cursor-pointer" onClick={() => { setSelectedLead(lead); setDetailOpen(true) }}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                            {lead.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-surface-900">{lead.name}</p>
                            <p className="text-xs text-surface-400">{lead.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-surface-600">{INTEREST_LABELS[lead.interest || ''] || lead.interest || '—'}</td>
                      <td className="px-5 py-3.5">
                        {lead.consultation_date ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-surface-400" />
                            <span className="text-surface-700">{formatDate(lead.consultation_date)}</span>
                            <span className="text-xs text-surface-400">{formatTime(lead.consultation_date)}</span>
                          </div>
                        ) : (
                          <span className="text-surface-400">Not scheduled</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${sc.color}`}>
                          <StatusIcon className="h-3 w-3" />{sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-surface-500">
                        {lead.utm_source ? `${lead.utm_source}${lead.utm_campaign ? ` / ${lead.utm_campaign}` : ''}` : lead.source || 'Direct'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-surface-500">{formatRelative(lead.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <button className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600"
                          onClick={e => { e.stopPropagation(); setSelectedLead(lead); setDetailOpen(true) }}>
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4"><Pagination currentPage={page} totalItems={filtered.length} pageSize={ITEMS_PER_PAGE} onPageChange={setPage} /></div>
        )}
      </div>

      {/* Lead Detail Modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Lead Details" width="max-w-2xl">
        {selectedLead && (() => {
          const sc = STATUS_CONFIG[selectedLead.status] || STATUS_CONFIG.new
          const StatusIcon = sc.icon
          return (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">
                    {selectedLead.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-surface-900">{selectedLead.name}</h3>
                    <div className="mt-1 flex items-center gap-3 text-sm text-surface-500">
                      <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{selectedLead.email}</span>
                      {selectedLead.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{selectedLead.phone}</span>}
                    </div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${sc.color}`}>
                  <StatusIcon className="h-3.5 w-3.5" />{sc.label}
                </span>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-surface-50 p-4">
                <div>
                  <p className="text-xs font-medium text-surface-400">Interest</p>
                  <p className="mt-0.5 font-medium text-surface-800">{INTEREST_LABELS[selectedLead.interest || ''] || selectedLead.interest || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-surface-400">Source</p>
                  <p className="mt-0.5 font-medium text-surface-800">
                    {selectedLead.utm_source ? `${selectedLead.utm_source}${selectedLead.utm_campaign ? ` / ${selectedLead.utm_campaign}` : ''}` : selectedLead.source || 'Direct'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-surface-400">Consultation</p>
                  {selectedLead.consultation_date ? (
                    <p className="mt-0.5 font-medium text-surface-800">
                      {formatDate(selectedLead.consultation_date)} at {formatTime(selectedLead.consultation_date)}
                    </p>
                  ) : <p className="mt-0.5 text-surface-400">Not scheduled</p>}
                </div>
                <div>
                  <p className="text-xs font-medium text-surface-400">Received</p>
                  <p className="mt-0.5 font-medium text-surface-800">{formatDate(selectedLead.created_at)}</p>
                </div>
              </div>

              {/* Message */}
              {selectedLead.message && (
                <div>
                  <p className="mb-1 text-xs font-medium text-surface-400">Message from lead</p>
                  <p className="rounded-lg bg-blue-50 p-3 text-sm text-surface-700 italic">&ldquo;{selectedLead.message}&rdquo;</p>
                </div>
              )}

              {/* Meet Link */}
              {selectedLead.meet_link && (
                <a href={selectedLead.meet_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 transition-colors hover:bg-emerald-100">
                  <Video className="h-5 w-5" />
                  Join Google Meet
                  <ExternalLink className="ml-auto h-4 w-4 opacity-50" />
                </a>
              )}

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-surface-400">Notes</p>
                  <button onClick={() => { setNotesText(selectedLead.notes || ''); setNotesOpen(true) }}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    <StickyNote className="mr-1 inline h-3 w-3" />{selectedLead.notes ? 'Edit' : 'Add'} Notes
                  </button>
                </div>
                {selectedLead.notes && <p className="mt-1 text-sm text-surface-600">{selectedLead.notes}</p>}
              </div>

              {/* Status Change + Actions */}
              <div className="border-t border-surface-200 pt-4">
                <p className="mb-2 text-xs font-medium text-surface-400">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon
                    return (
                      <button key={key} onClick={() => handleStatusChange(selectedLead, key)}
                        disabled={updatingStatus === selectedLead.id || selectedLead.status === key}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                          selectedLead.status === key
                            ? `${cfg.color} ring-2 ring-offset-1`
                            : 'bg-white text-surface-600 ring-1 ring-surface-200 hover:ring-surface-300'
                        } disabled:cursor-not-allowed disabled:opacity-50`}>
                        <Icon className="h-3 w-3" />{cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-surface-200 pt-4">
                <button onClick={() => handleDelete(selectedLead.id)}
                  className="flex items-center gap-1.5 text-xs font-medium text-rose-500 hover:text-rose-700">
                  <Trash2 className="h-3.5 w-3.5" /> Delete Lead
                </button>
                <button onClick={() => setDetailOpen(false)}
                  className="rounded-lg bg-surface-100 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-200">
                  Close
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Notes Edit Modal */}
      <Modal open={notesOpen} onClose={() => setNotesOpen(false)} title="Edit Notes">
        <div className="space-y-4">
          <textarea value={notesText} onChange={e => setNotesText(e.target.value)} rows={4}
            className="w-full rounded-lg border border-surface-200 p-3 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            placeholder="Add notes about this lead..." />
          <div className="flex justify-end gap-2">
            <button onClick={() => setNotesOpen(false)} className="rounded-lg bg-surface-100 px-4 py-2 text-sm font-medium text-surface-700">Cancel</button>
            <button onClick={handleSaveNotes} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Save Notes</button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
    </RoleGuard>
  )
}
