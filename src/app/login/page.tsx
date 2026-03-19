'use client'

import { useState, FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Mail, Lock, Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      <div className="hidden w-[480px] flex-col justify-between bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-10 lg:flex">
        <div>
          <img src="/images/logo-light.png" alt="AeroBridge" className="h-10 object-contain" />
          <p className="mt-2 text-sm font-medium text-white/60">Aviation Education Platform</p>
        </div>
        <div>
          <h2 className="text-3xl font-extrabold leading-tight text-white">Clear English.<br />Confident flights.</h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            From classroom to cockpit, in one clear language. Manage courses, track certifications, and prepare for ICAO/FAA tests.
          </p>
        </div>
        <div className="text-xs text-white/30">© {new Date().getFullYear()} AeroBridge. All rights reserved.</div>
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

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
