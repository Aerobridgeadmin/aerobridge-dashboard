'use client'

import { useState, FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Mail, Lock, User, Loader2, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function SignupPage() {
  const { signUp } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) { setError('Password must include an uppercase letter and a number'); return }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error } = await signUp(form.email, form.password, { full_name: form.name })
    if (error) setError(error.message)
    else setSuccess(true)
    setLoading(false)
  }


  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50 px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success-50"><CheckCircle className="h-8 w-8 text-success-500" /></div>
          <h2 className="mt-5 text-2xl font-extrabold text-surface-800">Check your email</h2>
          <p className="mt-2 text-sm leading-relaxed text-surface-500">We've sent a confirmation link to <span className="font-semibold text-surface-700">{form.email}</span>. Click the link to activate your account.</p>
          <Link href="/login" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"><ArrowRight className="h-4 w-4" /> Back to Login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[480px] flex-col justify-between bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-10 lg:flex">
        <div>
          <img src="/images/logo-light.png" alt="AeroBridge" className="h-10 object-contain" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold leading-tight text-white">Bridge the gap between<br />training and takeoff</h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">Create your account and start your aviation English journey with courses, live classes, and certification prep.</p>
          <div className="mt-8 space-y-3">
            {['Personalized learning paths', 'Live virtual classrooms', 'Certificates on completion', 'Discussion forums'].map(f => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-white/80"><CheckCircle className="h-4 w-4 text-white/50" />{f}</div>
            ))}
          </div>
        </div>
        <div className="text-xs text-white/30">© {new Date().getFullYear()} AeroBridge</div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-surface-50 px-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-extrabold text-surface-800">Create your account</h2>
          <p className="mt-1 text-sm text-surface-500">Fill in your details to get started</p>

          {error && <div className="mt-4 rounded-lg border border-cta-500/20 bg-red-50 px-4 py-3 text-sm text-cta-500">{error}</div>}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-surface-600">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <input type="text" required placeholder="John Doe" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11 w-full rounded-lg border border-surface-200 bg-white pl-10 pr-4 text-sm text-surface-800 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-surface-600">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <input type="email" required placeholder="you@company.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-11 w-full rounded-lg border border-surface-200 bg-white pl-10 pr-4 text-sm text-surface-800 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-surface-600">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <input type={showPassword ? 'text' : 'password'} required placeholder="Min. 6 characters" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="h-11 w-full rounded-lg border border-surface-200 bg-white pl-10 pr-10 text-sm text-surface-800 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-surface-600">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <input type="password" required placeholder="••••••••" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} className="h-11 w-full rounded-lg border border-surface-200 bg-white pl-10 pr-4 text-sm text-surface-800 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Create Account</span><ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-surface-500">
            Already have an account?{' '}<Link href="/login" className="font-semibold text-brand-500 hover:text-brand-600">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
