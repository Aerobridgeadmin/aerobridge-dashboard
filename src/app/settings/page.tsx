'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Toast from '@/components/Toast'
import Modal, { FormField, FormInput, FormTextarea, FormActions } from '@/components/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getEmailTemplates, updateEmailTemplate, getEmailSettings, updateEmailSetting } from '@/lib/data'
import { EmailTemplate } from '@/lib/supabase'
import {
  User, Bell, Key, Loader2, Save, Shield, Server, Mail, Eye, Edit2,
  Code, CheckCircle2, Users, Settings2, ChevronRight
} from 'lucide-react'
import Link from 'next/link'

export default function SettingsPage() {
  const { profile, user, updateProfile, isAdmin } = useAuth()
  const [form, setForm] = useState({ full_name: '', department: '', phone: '', bio: '' })
  const [notifs, setNotifs] = useState({ email_announcements: true, email_assignments: true, email_grades: true, email_discussions: true, email_schedule: true })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [changingPassword, setChangingPassword] = useState(false)

  // Admin: email templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [emailSettings, setEmailSettings] = useState<Record<string, string>>({})
  const [loadingAdmin, setLoadingAdmin] = useState(false)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null)
  const [showSmtp, setShowSmtp] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', html_body: '', description: '' })
  const [smtpForm, setSmtpForm] = useState({ smtp_host: '', smtp_port: '', smtp_user: '', smtp_pass: '', from_email: '', from_name: '' })

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name || '', department: profile.department || '', phone: profile.phone || '', bio: profile.bio || '' })
    if (user) {
      supabase.from('notification_settings').select('*').eq('user_id', user.id).single().then(({ data }) => {
        if (data) setNotifs(data as any)
      })
    }
  }, [profile, user])

  useEffect(() => {
    if (!isAdmin) return
    setLoadingAdmin(true)
    Promise.all([getEmailTemplates(), getEmailSettings()]).then(([t, s]) => {
      setTemplates(t)
      setEmailSettings(s)
      setSmtpForm({
        smtp_host: s.smtp_host || '', smtp_port: s.smtp_port || '',
        smtp_user: s.smtp_user || '', smtp_pass: s.smtp_pass || '',
        from_email: s.from_email || '', from_name: s.from_name || '',
      })
      setLoadingAdmin(false)
    })
  }, [isAdmin])

  const handleProfile = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    const { error } = await updateProfile(form as any)
    if (user) await supabase.from('notification_settings').upsert({ user_id: user.id, ...notifs })
    setToast(error ? { message: String(error), type: 'error' } : { message: 'Settings saved', type: 'success' })
    setSaving(false)
  }

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault()
    if (!passwords.currentPassword) { setToast({ message: 'Enter your current password', type: 'error' }); return }
    if (passwords.newPassword.length < 8) { setToast({ message: 'Password must be at least 8 characters', type: 'error' }); return }
    if (!/[A-Z]/.test(passwords.newPassword) || !/[0-9]/.test(passwords.newPassword)) { setToast({ message: 'Password must include an uppercase letter and a number', type: 'error' }); return }
    if (passwords.newPassword !== passwords.confirmPassword) { setToast({ message: 'Passwords do not match', type: 'error' }); return }
    setChangingPassword(true)
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user?.email || '', password: passwords.currentPassword })
    if (verifyError) { setToast({ message: 'Current password is incorrect', type: 'error' }); setChangingPassword(false); return }
    const { error } = await supabase.auth.updateUser({ password: passwords.newPassword })
    setToast(error ? { message: error.message, type: 'error' } : { message: 'Password updated', type: 'success' })
    setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setChangingPassword(false)
  }

  const openEdit = (t: EmailTemplate) => {
    setEditing(t)
    setTemplateForm({ name: t.name, subject: t.subject, html_body: t.html_body, description: t.description || '' })
  }

  const handleTemplateSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSavingTemplate(true)
    try {
      await updateEmailTemplate(editing.id, templateForm)
      setToast({ message: 'Template updated', type: 'success' })
      setEditing(null)
      const [t] = await Promise.all([getEmailTemplates()])
      setTemplates(t)
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSavingTemplate(false)
  }

  const handleSmtpSave = async (e: FormEvent) => {
    e.preventDefault()
    setSavingTemplate(true)
    try {
      for (const [key, value] of Object.entries(smtpForm)) await updateEmailSetting(key, value)
      setToast({ message: 'SMTP settings saved', type: 'success' })
      setShowSmtp(false)
      const s = await getEmailSettings()
      setEmailSettings(s)
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSavingTemplate(false)
  }

  const roleBadge = profile?.role === 'admin' ? 'badge-rose' : profile?.role === 'instructor' ? 'badge-blue' : 'badge-green'

  const templateIcon: Record<string, string> = {
    confirmation: '✉️', recovery: '🔑', invite: '🎫', magic_link: '🔗',
    email_change: '📧', welcome: '👋', course_completion: '🎓', quiz_result: '📝',
    consultation: '🗓️',
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Settings" subtitle="Manage your profile, preferences and system configuration" />
      <div className="mx-auto max-w-3xl p-8">

        {/* Profile header */}
        <div className="card mb-6 flex items-center gap-5 p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white">
            {profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
          </div>
          <div>
            <h3 className="text-lg font-bold text-surface-800">{profile?.full_name || 'User'}</h3>
            <p className="text-sm text-surface-500">{user?.email}</p>
            <span className={`badge mt-1 ${roleBadge} capitalize`}>{profile?.role}</span>
          </div>
        </div>

        <form onSubmit={handleProfile}>
          <div className="card mb-6 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-surface-800"><User className="h-4 w-4 text-brand-500" /> Profile Information</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-surface-600">Full Name</label>
                  <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-surface-600">Email</label>
                  <input type="email" value={user?.email || ''} disabled className="h-10 w-full rounded-lg border border-surface-200 bg-surface-50 px-3 text-sm text-surface-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-surface-600">Department</label>
                  <input type="text" placeholder="e.g. Training" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-surface-600">Phone</label>
                  <input type="tel" placeholder="+1 234 567 890" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-surface-600">Bio</label>
                <textarea rows={3} placeholder="Tell us about yourself..." value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
              </div>
            </div>
          </div>

          <div className="card mb-6 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-surface-800"><Bell className="h-4 w-4 text-brand-500" /> Email Notifications</h3>
            <div className="space-y-3">
              {([
                { key: 'email_announcements', label: 'Announcements' },
                { key: 'email_assignments', label: 'Assignments & Deadlines' },
                { key: 'email_grades', label: 'Grades & Certificates' },
                { key: 'email_discussions', label: 'Discussion Replies' },
                { key: 'email_schedule', label: 'Schedule Changes' },
              ] as const).map(n => (
                <label key={n.key} className="flex items-center justify-between rounded-lg border border-surface-100 px-4 py-3 transition-colors hover:bg-surface-50">
                  <span className="text-sm text-surface-700">{n.label}</span>
                  <input type="checkbox" checked={notifs[n.key]} onChange={e => setNotifs({ ...notifs, [n.key]: e.target.checked })} className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500" />
                </label>
              ))}
            </div>
          </div>

          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
          </button>
        </form>

        <form onSubmit={handlePasswordChange} className="mt-6">
          <div className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-surface-800"><Key className="h-4 w-4 text-brand-500" /> Change Password</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-surface-600">Current Password</label>
                <input type="password" placeholder="Enter current password" value={passwords.currentPassword} onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-surface-600">New Password</label>
                  <input type="password" placeholder="Min. 8 chars, uppercase + number" value={passwords.newPassword} onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-surface-600">Confirm Password</label>
                  <input type="password" placeholder="••••••••" value={passwords.confirmPassword} onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
                </div>
              </div>
            </div>
            <button type="submit" disabled={changingPassword || !passwords.newPassword} className="mt-4 flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50">
              {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Update Password
            </button>
          </div>
        </form>

        {/* ── Admin-only sections ── */}
        {isAdmin && (
          <div className="mt-10">
            <div className="mb-4 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-surface-400" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-surface-400">Admin Configuration</h2>
            </div>

            {/* Quick links */}
            <div className="mb-6 grid grid-cols-2 gap-3">
              <Link href="/users" className="card flex items-center justify-between p-4 transition-all hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                    <Users className="h-4 w-4 text-brand-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-surface-800">User Management</p>
                    <p className="text-xs text-surface-500">Roles & access control</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-surface-400" />
              </Link>
              <button onClick={() => setShowSmtp(true)} className="card flex items-center justify-between p-4 text-left transition-all hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                    <Server className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-surface-800">SMTP / Email</p>
                    <p className="text-xs text-surface-500">
                      {emailSettings.smtp_user
                        ? <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" />{emailSettings.smtp_user}</span>
                        : 'Not configured'
                      }
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-surface-400" />
              </button>
            </div>

            {/* Email Templates */}
            <div className="card p-6">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-surface-800">
                <Mail className="h-4 w-4 text-brand-500" /> Email Templates
              </h3>
              <p className="mb-5 text-xs text-surface-500">Manage branded email templates sent to students and staff.</p>

              {loadingAdmin ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-500" /></div>
              ) : (
                <div className="space-y-2">
                  {templates.map(t => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg border border-surface-100 px-4 py-3 hover:bg-surface-50">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{templateIcon[t.template_key] || '📄'}</span>
                        <div>
                          <p className="text-sm font-medium text-surface-800">{t.name}</p>
                          <p className="font-mono text-[10px] text-surface-400">{t.template_key}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${t.is_active ? 'bg-green-50 text-green-700' : 'bg-surface-100 text-surface-500'}`}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <button onClick={() => setPreviewing(t)} className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-brand-500">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openEdit(t)} className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-brand-500">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Template Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name || ''}`}>
        <form onSubmit={handleTemplateSave} className="space-y-4">
          <FormField label="Template Name"><FormInput value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></FormField>
          <FormField label="Subject Line"><FormInput value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} /></FormField>
          <FormField label="Description"><FormInput value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} /></FormField>
          <FormField label="HTML Body">
            <FormTextarea rows={16} value={templateForm.html_body} onChange={(e) => setTemplateForm({ ...templateForm, html_body: e.target.value })} className="font-mono text-xs" />
          </FormField>
          {editing?.variables && editing.variables.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-surface-600">Available Variables</p>
              <div className="flex flex-wrap gap-1">{editing.variables.map(v => <span key={v} className="rounded bg-surface-100 px-2 py-0.5 font-mono text-[10px] text-surface-600">{v}</span>)}</div>
            </div>
          )}
          <FormActions onCancel={() => setEditing(null)} loading={savingTemplate} submitLabel="Save Template" />
        </form>
      </Modal>

      {/* Preview Modal */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-surface-200 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-surface-900">{previewing.name}</h3>
                <p className="text-xs text-surface-500">Subject: {previewing.subject}</p>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(previewing.html_body); setToast({ message: 'HTML copied', type: 'success' }) }}
                className="flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50">
                <Code className="h-3.5 w-3.5" /> Copy HTML
              </button>
            </div>
            <div className="bg-surface-100 p-6">
              <iframe
                srcDoc={previewing.html_body.replace(/\{\{\.ConfirmationURL\}\}/g, '#').replace(/\{\{[^}]+\}\}/g, 'Example')}
                className="h-[600px] w-full rounded-lg border-0 bg-white" title="Preview" />
            </div>
          </div>
        </div>
      )}

      {/* SMTP Modal */}
      <Modal open={showSmtp} onClose={() => setShowSmtp(false)} title="SMTP Configuration">
        <form onSubmit={handleSmtpSave} className="space-y-4">
          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            For Google Workspace: use <strong>smtp.gmail.com</strong> port <strong>587</strong>. Create an{' '}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" className="font-semibold underline">App Password</a> (requires 2FA).
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="SMTP Host"><FormInput placeholder="smtp.gmail.com" value={smtpForm.smtp_host} onChange={e => setSmtpForm({ ...smtpForm, smtp_host: e.target.value })} /></FormField>
            <FormField label="Port"><FormInput placeholder="587" value={smtpForm.smtp_port} onChange={e => setSmtpForm({ ...smtpForm, smtp_port: e.target.value })} /></FormField>
          </div>
          <FormField label="SMTP Username"><FormInput placeholder="noreply@aerobridge.cl" value={smtpForm.smtp_user} onChange={e => setSmtpForm({ ...smtpForm, smtp_user: e.target.value })} /></FormField>
          <FormField label="App Password"><FormInput type="password" placeholder="App password" value={smtpForm.smtp_pass} onChange={e => setSmtpForm({ ...smtpForm, smtp_pass: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="From Email"><FormInput placeholder="noreply@aerobridge.cl" value={smtpForm.from_email} onChange={e => setSmtpForm({ ...smtpForm, from_email: e.target.value })} /></FormField>
            <FormField label="From Name"><FormInput placeholder="AeroBridge" value={smtpForm.from_name} onChange={e => setSmtpForm({ ...smtpForm, from_name: e.target.value })} /></FormField>
          </div>
          <FormActions onCancel={() => setShowSmtp(false)} loading={savingTemplate} submitLabel="Save SMTP Settings" />
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
