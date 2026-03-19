'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Toast from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { User, Mail, Phone, Briefcase, FileText, Bell, Shield, Key, Loader2, Save } from 'lucide-react'

export default function SettingsPage() {
  const { profile, user, updateProfile } = useAuth()
  const [form, setForm] = useState({ full_name: '', department: '', phone: '', bio: '' })
  const [notifs, setNotifs] = useState({ email_announcements: true, email_assignments: true, email_grades: true, email_discussions: true, email_schedule: true })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name || '', department: profile.department || '', phone: profile.phone || '', bio: profile.bio || '' })
    if (user) {
      supabase.from('notification_settings').select('*').eq('user_id', user.id).single().then(({ data }) => {
        if (data) setNotifs(data as any)
      })
    }
  }, [profile, user])

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

  const roleBadge = profile?.role === 'admin' ? 'badge-rose' : profile?.role === 'instructor' ? 'badge-blue' : 'badge-green'

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Settings" subtitle="Manage your profile and preferences" />
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
          {/* Profile info */}
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
                <textarea rows={3} placeholder="Tell us about yourself..." value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
              </div>
            </div>
          </div>

          {/* Notification prefs */}
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

        {/* Change password */}
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
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
