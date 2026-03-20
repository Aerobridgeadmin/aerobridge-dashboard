'use client'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Plane, ArrowRight, ArrowLeft, User, BookOpen, Bell, CheckCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function OnboardingPage() {
  const { profile, updateProfile, user } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ full_name: profile?.full_name || '', department: '', phone: '', bio: '' })
  const [notifs, setNotifs] = useState({ email_announcements: true, email_assignments: true, email_grades: true, email_discussions: true, email_schedule: true })
  const [saving, setSaving] = useState(false)

  const steps = [
    { icon: User, title: 'Complete your profile', desc: 'Tell us a bit about yourself' },
    { icon: Bell, title: 'Notification preferences', desc: 'Choose how you want to stay updated' },
    { icon: CheckCircle, title: "You're all set!", desc: 'Start exploring the platform' },
  ]

  const handleFinish = async () => {
    setSaving(true)
    await updateProfile({ ...form, onboarding_complete: true } as any)
    if (user) {
      await supabase.from('notification_settings').upsert({ user_id: user.id, ...notifs })
    }
    setSaving(false)
    router.push('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: '#0B3D91' }}><Plane className="h-4 w-4 text-white" /></div>
          <h1 className="text-lg font-extrabold uppercase tracking-wide text-surface-800">AeroBridge</h1>
        </div>

        {/* Progress */}
        <div className="mb-8 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= step ? 'bg-brand-500 text-white' : 'bg-surface-200 text-surface-500'}`}>
                {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? 'bg-brand-500' : 'bg-surface-200'}`} />}
            </div>
          ))}
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-extrabold text-surface-800">{steps[step].title}</h2>
          <p className="mt-1 text-sm text-surface-500">{steps[step].desc}</p>

          {step === 0 && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-surface-600">Full Name</label>
                <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-surface-600">Department</label>
                  <input type="text" placeholder="e.g. Engineering" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
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
          )}

          {step === 1 && (
            <div className="mt-6 space-y-3">
              {([
                { key: 'email_announcements', label: 'Announcements', desc: 'Platform updates and news' },
                { key: 'email_assignments', label: 'Assignments', desc: 'New assignments and deadlines' },
                { key: 'email_grades', label: 'Grades & Certificates', desc: 'Quiz results and certificate issuance' },
                { key: 'email_discussions', label: 'Discussions', desc: 'Replies to your posts' },
                { key: 'email_schedule', label: 'Schedule', desc: 'Class reminders and changes' },
              ] as const).map(n => (
                <label key={n.key} className="flex items-center justify-between rounded-lg border border-surface-200 bg-white p-4 transition-colors hover:bg-surface-50">
                  <div><p className="text-sm font-medium text-surface-800">{n.label}</p><p className="text-xs text-surface-500">{n.desc}</p></div>
                  <input type="checkbox" checked={notifs[n.key]} onChange={e => setNotifs({ ...notifs, [n.key]: e.target.checked })} className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500" />
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="mt-6 flex flex-col items-center py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success-50"><CheckCircle className="h-8 w-8 text-success-500" /></div>
              <p className="mt-4 text-sm text-surface-600">Your account is ready. Welcome aboard, <span className="font-bold">{form.full_name || profile?.full_name}</span>!</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-xs font-medium text-brand-600">
                <BookOpen className="h-3.5 w-3.5" />
                Role: <span className="font-bold capitalize">{profile?.role}</span>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="flex items-center gap-2 text-sm font-medium text-surface-500 hover:text-surface-700"><ArrowLeft className="h-4 w-4" /> Back</button>
            ) : <div />}
            {step < 2 ? (
              <button onClick={() => setStep(step + 1)} className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Continue <ArrowRight className="h-4 w-4" /></button>
            ) : (
              <button onClick={handleFinish} disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Go to Dashboard'} <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
