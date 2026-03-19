'use client'

import { useState, FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Mail, Lock, User, Loader2, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react'
import Link from 'next/link'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function SignupPage() {
  const { signUp, signInWithGoogle } = useAuth()
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
      <div className="relative hidden w-[480px] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-10 lg:flex">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%222%22%20cy%3D%222%22%20r%3D%221.5%22%20fill%3D%22rgba(255%2C255%2C255%2C0.04)%22%2F%3E%3C%2Fsvg%3E')]"></div>
        <div className="relative z-10 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 p-2 shadow-lg backdrop-blur-sm ring-1 ring-white/20">
            <img src="/images/logo-light.png" alt="AeroBridge" className="h-12 w-12 object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">AeroBridge</h1>
            <p className="text-sm font-medium text-white/60">Aviation Education Platform</p>
          </div>
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-extrabold leading-tight text-white">Bridge the gap between<br />training and takeoff</h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">Create your account and start your aviation English journey with courses, live classes, and certification prep.</p>
          <div className="mt-8 space-y-3">
            {['Personalized learning paths', 'Live virtual classrooms', 'Certificates on completion', 'Discussion forums'].map(f => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-white/80"><CheckCircle className="h-4 w-4 text-white/50" />{f}</div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-white/30">© {new Date().getFullYear()} AeroBridge</div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-surface-50 px-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-extrabold text-surface-800">Create your account</h2>
          <p className="mt-1 text-sm text-surface-500">Fill in your details to get started</p>

          {error && <div className="mt-4 rounded-lg border border-cta-500/20 bg-red-50 px-4 py-3 text-sm text-cta-500">{error}</div>}

          <button
            onClick={async () => { const { error } = await signInWithGoogle(); if (error) setError(error.message) }}
            className="mt-6 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 shadow-sm transition-all hover:bg-surface-50 hover:shadow-md active:scale-[0.98]"
          >
            <GoogleIcon className="h-5 w-5" />
            Sign up with Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-surface-200" /></div>
            <div className="relative flex justify-center"><span className="bg-surface-50 px-3 text-xs text-surface-400">or sign up with email</span></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
