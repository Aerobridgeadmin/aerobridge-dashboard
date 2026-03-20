'use client'

import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormTextarea, FormActions } from '@/components/Modal'
import Toast from '@/components/Toast'
import { getEmailTemplates, updateEmailTemplate, getEmailSettings, updateEmailSetting } from '@/lib/data'
import { EmailTemplate } from '@/lib/supabase'
import { Mail, Edit2, Eye, Loader2, Save, Settings, CheckCircle2, Code, Server } from 'lucide-react'

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null)
  const [showSmtp, setShowSmtp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [form, setForm] = useState({ name: '', subject: '', html_body: '', description: '' })
  const [smtpForm, setSmtpForm] = useState({ smtp_host: '', smtp_port: '', smtp_user: '', smtp_pass: '', from_email: '', from_name: '' })

  const load = async () => {
    const [t, s] = await Promise.all([getEmailTemplates(), getEmailSettings()])
    setTemplates(t)
    setSettings(s)
    setSmtpForm({
      smtp_host: s.smtp_host || '', smtp_port: s.smtp_port || '',
      smtp_user: s.smtp_user || '', smtp_pass: s.smtp_pass || '',
      from_email: s.from_email || '', from_name: s.from_name || '',
    })
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openEdit = (t: EmailTemplate) => {
    setEditing(t)
    setForm({ name: t.name, subject: t.subject, html_body: t.html_body, description: t.description || '' })
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      await updateEmailTemplate(editing.id, form)
      setToast({ message: 'Template updated', type: 'success' })
      setEditing(null)
      load()
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
    }
    setSaving(false)
  }

  const handleSmtpSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      for (const [key, value] of Object.entries(smtpForm)) {
        await updateEmailSetting(key, value)
      }
      setToast({ message: 'SMTP settings saved', type: 'success' })
      setShowSmtp(false)
      load()
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
    }
    setSaving(false)
  }

  const typeIcon: Record<string, string> = {
    confirmation: '✉️', recovery: '🔑', invite: '🎫', magic_link: '🔗',
    email_change: '📧', welcome: '👋', course_completion: '🎓', quiz_result: '📝',
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-surface-50"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Email Templates" subtitle="Manage AeroBridge-branded email templates stored in the database" />

      <div className="p-8">
        {/* SMTP Config Banner */}
        <div className="mb-6 flex items-center justify-between rounded-xl border border-surface-200 bg-white p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <Server className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-surface-900">SMTP Configuration</p>
              <p className="text-xs text-surface-500">
                {settings.smtp_user ? (
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {settings.smtp_user} via {settings.smtp_host}</span>
                ) : (
                  'Not configured — emails will use Supabase default sender'
                )}
              </p>
            </div>
          </div>
          <button onClick={() => setShowSmtp(true)} className="flex items-center gap-2 rounded-lg border border-surface-200 px-4 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50">
            <Settings className="h-3.5 w-3.5" /> Configure SMTP
          </button>
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t, i) => (
            <div key={t.id} className="card animate-slide-up overflow-hidden" style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}>
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{typeIcon[t.template_key] || '📄'}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-surface-900">{t.name}</h3>
                      <p className="text-[10px] font-mono text-surface-400">{t.template_key}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${t.is_active ? 'bg-green-50 text-green-700' : 'bg-surface-100 text-surface-500'}`}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {t.description && <p className="mt-3 text-xs text-surface-500">{t.description}</p>}
                <div className="mt-3 rounded-lg bg-surface-50 px-3 py-2">
                  <p className="text-xs text-surface-600"><strong>Subject:</strong> {t.subject}</p>
                </div>
                {t.variables.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.variables.map(v => (
                      <span key={v} className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[9px] text-brand-600">{v}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex border-t border-surface-100">
                <button onClick={() => setPreviewing(t)} className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-medium text-surface-500 transition-colors hover:bg-surface-50 hover:text-brand-500">
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
                <div className="w-px bg-surface-100" />
                <button onClick={() => openEdit(t)} className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-medium text-surface-500 transition-colors hover:bg-surface-50 hover:text-brand-500">
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Supabase Integration Note */}
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <Code className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Supabase Auth Email Templates</h3>
              <p className="mt-1 text-xs leading-relaxed text-amber-700">
                To use these branded templates for Supabase auth emails (confirmation, password reset, invite), copy the HTML from each template and paste it into your{' '}
                <a href="https://supabase.com/dashboard/project/laeqvccuxcgmuupecqxt/auth/templates" target="_blank" rel="noopener" className="font-semibold underline">Supabase Auth Templates settings</a>.
                The templates use Supabase variables like {'{{.ConfirmationURL}}'} which Supabase replaces automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name || ''}`}>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Template Name"><FormInput value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Subject Line"><FormInput value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></FormField>
          <FormField label="Description"><FormInput value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
          <FormField label="HTML Body">
            <FormTextarea rows={16} value={form.html_body} onChange={(e) => setForm({ ...form, html_body: e.target.value })} className="font-mono text-xs" />
          </FormField>
          {editing?.variables && editing.variables.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-surface-600">Available Variables</p>
              <div className="flex flex-wrap gap-1">{editing.variables.map(v => <span key={v} className="rounded bg-surface-100 px-2 py-0.5 font-mono text-[10px] text-surface-600">{v}</span>)}</div>
            </div>
          )}
          <FormActions onCancel={() => setEditing(null)} loading={saving} submitLabel="Save Template" />
        </form>
      </Modal>

      {/* Preview Modal */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-surface-200 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-surface-900">{previewing.name} — Preview</h3>
                <p className="text-xs text-surface-500">Subject: {previewing.subject}</p>
              </div>
              <button onClick={() => {
                navigator.clipboard.writeText(previewing.html_body)
                setToast({ message: 'HTML copied to clipboard', type: 'success' })
              }} className="flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50">
                <Code className="h-3.5 w-3.5" /> Copy HTML
              </button>
            </div>
            <div className="bg-surface-100 p-6">
              <iframe
                srcDoc={previewing.html_body.replace(/\{\{\.ConfirmationURL\}\}/g, '#').replace(/\{\{[^}]+\}\}/g, 'Example')}
                className="h-[600px] w-full rounded-lg border-0 bg-white"
                title="Email Preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* SMTP Settings Modal */}
      <Modal open={showSmtp} onClose={() => setShowSmtp(false)} title="SMTP Configuration (Google)">
        <form onSubmit={handleSmtpSave} className="space-y-4">
          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            For Google Workspace: use <strong>smtp.gmail.com</strong> port <strong>587</strong>. Create an{' '}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" className="font-semibold underline">App Password</a>{' '}
            (requires 2FA enabled).
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="SMTP Host"><FormInput placeholder="smtp.gmail.com" value={smtpForm.smtp_host} onChange={(e) => setSmtpForm({ ...smtpForm, smtp_host: e.target.value })} /></FormField>
            <FormField label="Port"><FormInput placeholder="587" value={smtpForm.smtp_port} onChange={(e) => setSmtpForm({ ...smtpForm, smtp_port: e.target.value })} /></FormField>
          </div>
          <FormField label="SMTP Username (Email)"><FormInput placeholder="noreply@aerobridge.cl" value={smtpForm.smtp_user} onChange={(e) => setSmtpForm({ ...smtpForm, smtp_user: e.target.value })} /></FormField>
          <FormField label="SMTP Password / App Password"><FormInput type="password" placeholder="App password from Google" value={smtpForm.smtp_pass} onChange={(e) => setSmtpForm({ ...smtpForm, smtp_pass: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="From Email"><FormInput placeholder="noreply@aerobridge.cl" value={smtpForm.from_email} onChange={(e) => setSmtpForm({ ...smtpForm, from_email: e.target.value })} /></FormField>
            <FormField label="From Name"><FormInput placeholder="AeroBridge" value={smtpForm.from_name} onChange={(e) => setSmtpForm({ ...smtpForm, from_name: e.target.value })} /></FormField>
          </div>
          <FormActions onCancel={() => setShowSmtp(false)} loading={saving} submitLabel="Save SMTP Settings" />
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
