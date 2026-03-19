'use client'

import { useState, FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Mail, Lock, Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react'
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

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    const { error } = await signInWithGoogle()
    if (error) setError(error.message)
    setGoogleLoading(false)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Invalid email or password. Please try again.' : error.message)
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand */}
      <div className="relative hidden w-[480px] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-10 lg:flex">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%222%22%20cy%3D%222%22%20r%3D%221.5%22%20fill%3D%22rgba(255%2C255%2C255%2C0.04)%22%2F%3E%3C%2Fsvg%3E')]"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 p-2 shadow-lg backdrop-blur-sm ring-1 ring-white/20">
              <img src="/images/logo-light.png" alt="AeroBridge" className="h-12 w-12 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">AeroBridge</h1>
              <p className="text-sm font-medium text-white/60">Aviation Education Platform</p>
            </div>
          </div>
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-extrabold leading-tight text-white">Clear English.<br />Confident flights.</h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            From classroom to cockpit, in one clear language. Manage courses, track certifications, and prepare for ICAO/FAA tests.
          </p>
        </div>
        <div className="relative z-10 text-xs text-white/30">© {new Date().getFullYear()} AeroBridge. All rights reserved.</div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center bg-surface-50 px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src="/images/logo.png" alt="AeroBridge" className="h-10 object-contain" />
          </div>

          <h2 className="text-2xl font-extrabold text-surface-800">Welcome back</h2>
          <p className="mt-1 text-sm text-surface-500">Sign in to your account to continue</p>

          {error && (
            <div className="mt-4 rounded-lg border border-cta-500/20 bg-red-50 px-4 py-3 text-sm text-cta-500">{error}</div>
          )}

          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="mt-6 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 shadow-sm transition-all hover:bg-surface-50 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-5 w-5" />}
            Continue with Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-surface-200" /></div>
            <div className="relative flex justify-center"><span className="bg-surface-50 px-3 text-xs text-surface-400">or sign in with email</span></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-surface-600">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <input type="email" required placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} className="h-11 w-full rounded-lg border border-surface-200 bg-white pl-10 pr-4 text-sm text-surface-800 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-surface-600">Password</label>
                <Link href="/forgot-password" className="text-xs font-medium text-brand-500 hover:text-brand-600">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <input type={showPassword ? 'text' : 'password'} required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="h-11 w-full rounded-lg border border-surface-200 bg-white pl-10 pr-10 text-sm text-surface-800 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Sign In</span><ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-surface-500">
            Don't have an account?{' '}
            <Link href="/signup" className="font-semibold text-brand-500 hover:text-brand-600">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
