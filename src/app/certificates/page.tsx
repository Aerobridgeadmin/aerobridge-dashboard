'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import { getCertificates } from '@/lib/data'
import { Certificate } from '@/lib/supabase'
import { Search, Download, ExternalLink, Award, Copy, Loader2 } from 'lucide-react'

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { getCertificates().then(d => { setCertificates(d); setLoading(false) }) }, [])

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Certificates" subtitle="View and manage issued certificates" />

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search certificates..." className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-4 py-2.5 text-sm font-medium text-surface-700 shadow-sm transition-all hover:bg-surface-50">
            <Download className="h-4 w-4" /> Export All
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50/50">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Certificate ID</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Student</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Course</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Issued Date</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((cert, i) => (
                <tr key={cert.id} className="animate-slide-up border-b border-surface-100 transition-colors last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-warning-500" />
                      <span className="font-mono text-sm font-medium text-surface-800">{cert.certificate_id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-semibold text-white">
                        {cert.student_name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="text-sm font-medium text-surface-900">{cert.student_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-surface-600">{cert.course_title}</td>
                  <td className="px-6 py-4 text-sm text-surface-500">{new Date(cert.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600" title="Copy link"><Copy className="h-3.5 w-3.5" /></button>
                      <button className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600" title="Download"><Download className="h-3.5 w-3.5" /></button>
                      <button className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600" title="View"><ExternalLink className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  )
}
