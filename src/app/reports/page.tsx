'use client'
import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import RoleGuard from '@/components/RoleGuard'
import { useAuth } from '@/contexts/AuthContext'
import { getComplianceOverview, getDashboardStats, getCourses, getStudents, getUserCertifications } from '@/lib/data'
import { Loader2, Shield, Users, BookOpen, AlertTriangle, CheckCircle, Clock, FileText, Download, BarChart3 } from 'lucide-react'

export default function ReportsPage() {
  const { isAdmin } = useAuth()
  const [compliance, setCompliance] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [courses, setCourses] = useState<any[]>([])
  const [allCerts, setAllCerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('compliance')

  useEffect(() => {
    Promise.all([getComplianceOverview(), getDashboardStats(), getCourses(), getUserCertifications()]).then(([c, s, co, ac]) => {
      setCompliance(c); setStats(s); setCourses(co); setAllCerts(ac); setLoading(false)
    })
  }, [])

  const tabs = [
    { id: 'compliance', label: 'Compliance', icon: Shield },
    { id: 'training', label: 'Training Overview', icon: BookOpen },
    { id: 'certifications', label: 'Cert Status', icon: FileText },
  ]

  const expiringCerts = allCerts.filter((c: any) => c.status === 'expiring_soon')
  const expiredCerts = allCerts.filter((c: any) => c.status === 'expired')
  const activeCerts = allCerts.filter((c: any) => c.status === 'active')

  return (
    <RoleGuard allowed={['admin', 'instructor']}>
    <div className="min-h-screen bg-surface-50">
      <Header title="Reports & Analytics" subtitle="Compliance reports, training analytics, and audit data" />
      <div className="p-8">
        {/* Tab bar */}
        <div className="mb-6 flex items-center gap-1 rounded-lg border border-surface-200 bg-white p-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${activeTab === t.id ? 'bg-brand-500 text-white shadow-sm' : 'text-surface-600 hover:bg-surface-50'}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div> : (
        <>
          {/* ── COMPLIANCE TAB ── */}
          {activeTab === 'compliance' && (
            <div>
              <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="card p-4 text-center"><p className="text-3xl font-extrabold text-brand-500">{allCerts.length}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-surface-500">Total certs</p></div>
                <div className="card p-4 text-center"><p className="text-3xl font-extrabold text-success-500">{activeCerts.length}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-surface-500">Active</p></div>
                <div className="card p-4 text-center"><p className="text-3xl font-extrabold" style={{ color: '#ffc107' }}>{expiringCerts.length}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-surface-500">Expiring soon</p></div>
                <div className="card p-4 text-center"><p className="text-3xl font-extrabold text-cta-500">{expiredCerts.length}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-surface-500">Expired</p></div>
              </div>

              {/* Compliance by user */}
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-surface-100 px-6 py-4">
                  <h3 className="text-sm font-bold text-surface-800">Compliance by user</h3>
                </div>
                <table className="w-full">
                  <thead><tr className="border-b border-surface-100 bg-surface-50/50">
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">User</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Role</th>
                    <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-surface-500">Active</th>
                    <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-surface-500">Expiring</th>
                    <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-surface-500">Expired</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Next expiry</th>
                    <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-surface-500">Status</th>
                  </tr></thead>
                  <tbody>
                    {compliance.filter((c: any) => c.total_certs > 0).map((row: any, i: number) => {
                      const hasIssue = row.expired_certs > 0 || row.expiring_certs > 0
                      return (
                        <tr key={row.user_id} className="animate-slide-up border-b border-surface-100 last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}>
                          <td className="px-6 py-3.5">
                            <p className="text-sm font-medium text-surface-800">{row.full_name || 'Unknown'}</p>
                            <p className="text-xs text-surface-400">{row.email}</p>
                          </td>
                          <td className="px-6 py-3.5"><span className="badge badge-blue text-[10px] capitalize">{row.role}</span></td>
                          <td className="px-6 py-3.5 text-center text-sm font-medium text-success-500">{row.active_certs}</td>
                          <td className="px-6 py-3.5 text-center text-sm font-medium" style={{ color: row.expiring_certs > 0 ? '#ffc107' : '#6c757d' }}>{row.expiring_certs}</td>
                          <td className="px-6 py-3.5 text-center text-sm font-medium text-cta-500">{row.expired_certs}</td>
                          <td className="px-6 py-3.5 text-sm text-surface-600">{row.next_expiry ? new Date(row.next_expiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                          <td className="px-6 py-3.5 text-center">
                            {row.expired_certs > 0 ? <span className="badge bg-red-50 text-[10px] text-red-600"><AlertTriangle className="mr-1 inline h-3 w-3" />Non-compliant</span>
                            : row.expiring_certs > 0 ? <span className="badge bg-amber-50 text-[10px] text-amber-700"><Clock className="mr-1 inline h-3 w-3" />At risk</span>
                            : <span className="badge bg-green-50 text-[10px] text-green-700"><CheckCircle className="mr-1 inline h-3 w-3" />Compliant</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {compliance.filter((c: any) => c.total_certs > 0).length === 0 && (
                  <div className="py-12 text-center text-sm text-surface-400">No certification data yet. Add certifications to see compliance status.</div>
                )}
              </div>
            </div>
          )}

          {/* ── TRAINING TAB ── */}
          {activeTab === 'training' && stats && (
            <div>
              <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="card p-4 text-center"><p className="text-3xl font-extrabold text-brand-500">{stats.totalStudents}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-surface-500">Students</p></div>
                <div className="card p-4 text-center"><p className="text-3xl font-extrabold text-success-500">{stats.totalCourses}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-surface-500">Courses</p></div>
                <div className="card p-4 text-center"><p className="text-3xl font-extrabold" style={{ color: '#ffc107' }}>{stats.activeBatches}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-surface-500">Active batches</p></div>
                <div className="card p-4 text-center"><p className="text-3xl font-extrabold" style={{ color: '#17a2b8' }}>{stats.completionRate}%</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-surface-500">Completion</p></div>
              </div>
              <div className="card overflow-hidden">
                <div className="border-b border-surface-100 px-6 py-4"><h3 className="text-sm font-bold text-surface-800">Course performance</h3></div>
                <table className="w-full">
                  <thead><tr className="border-b border-surface-100 bg-surface-50/50">
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Course</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Instructor</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Category</th>
                    <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-surface-500">Enrolled</th>
                    <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-surface-500">Status</th>
                  </tr></thead>
                  <tbody>
                    {courses.map((c: any, i: number) => (
                      <tr key={c.id} className="animate-slide-up border-b border-surface-100 last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}>
                        <td className="px-6 py-3.5 text-sm font-medium text-surface-800">{c.title}</td>
                        <td className="px-6 py-3.5 text-sm text-surface-600">{c.instructor}</td>
                        <td className="px-6 py-3.5"><span className="badge badge-blue text-[10px]">{c.category}</span></td>
                        <td className="px-6 py-3.5 text-center text-sm font-semibold text-surface-700">{c.enrolled_count}</td>
                        <td className="px-6 py-3.5 text-center"><span className={`badge text-[10px] ${c.published ? 'bg-green-50 text-green-700' : 'bg-surface-100 text-surface-500'}`}>{c.published ? 'Published' : 'Draft'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {courses.length === 0 && <div className="py-12 text-center text-sm text-surface-400">No courses yet.</div>}
              </div>
            </div>
          )}

          {/* ── CERT STATUS TAB ── */}
          {activeTab === 'certifications' && (
            <div>
              {expiringCerts.length > 0 && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-amber-800"><AlertTriangle className="h-4 w-4" /> {expiringCerts.length} certification(s) expiring within 30 days</h3>
                  <div className="mt-3 space-y-2">
                    {expiringCerts.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5">
                        <div><p className="text-sm font-medium text-surface-800">{c.certification_types?.name}</p><p className="text-xs text-surface-500">#{c.certificate_number}</p></div>
                        <p className="text-sm font-semibold text-amber-700">Expires {new Date(c.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {expiredCerts.length > 0 && (
                <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-red-700"><AlertTriangle className="h-4 w-4" /> {expiredCerts.length} expired certification(s)</h3>
                  <div className="mt-3 space-y-2">
                    {expiredCerts.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5">
                        <div><p className="text-sm font-medium text-surface-800">{c.certification_types?.name}</p><p className="text-xs text-surface-500">#{c.certificate_number}</p></div>
                        <p className="text-sm font-semibold text-red-600">Expired {new Date(c.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {allCerts.length === 0 && <div className="card py-12 text-center text-sm text-surface-400">No certifications tracked yet. Go to the Certifications page to add them.</div>}
              {activeCerts.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="border-b border-surface-100 px-6 py-4"><h3 className="text-sm font-bold text-surface-800">Active certifications ({activeCerts.length})</h3></div>
                  <div className="divide-y divide-surface-100">
                    {activeCerts.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between px-6 py-3.5">
                        <div><p className="text-sm font-medium text-surface-800">{c.certification_types?.name}</p><p className="text-xs text-surface-500">{c.certification_types?.authority} · #{c.certificate_number}</p></div>
                        <div className="text-right"><p className="text-sm text-surface-600">{c.expiry_date ? `Exp: ${new Date(c.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No expiry'}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
        )}
      </div>
    </div>
    </RoleGuard>
  )
}
