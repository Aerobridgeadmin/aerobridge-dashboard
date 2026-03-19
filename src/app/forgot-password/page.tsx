'use client'
import { useState, FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Plane, Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    const { error } = await resetPassword(email)
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: '#0B3D91' }}><Plane className="h-4 w-4 text-white" /></div>
          <h1 className="text-lg font-extrabold uppercase tracking-wide text-surface-800">AeroBridge</h1>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-50"><CheckCircle className="h-7 w-7 text-success-500" /></div>
            <h2 className="mt-4 text-xl font-extrabold text-surface-800">Check your email</h2>
            <p className="mt-2 text-sm text-surface-500">We sent a password reset link to <span className="font-semibold text-surface-700">{email}</span></p>
            <Link href="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Back to login</Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-extrabold text-surface-800">Reset password</h2>
            <p className="mt-1 text-sm text-surface-500">Enter your email and we'll send you a reset link</p>
            {error && <div className="mt-4 rounded-lg border border-cta-500/20 bg-red-50 px-4 py-3 text-sm text-cta-500">{error}</div>}
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-surface-600">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                  <input type="email" required placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} className="h-11 w-full rounded-lg border border-surface-200 bg-white pl-10 pr-4 text-sm text-surface-800 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Link'}
              </button>
            </form>
            <Link href="/login" className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-surface-500 hover:text-surface-700"><ArrowLeft className="h-3.5 w-3.5" /> Back to login</Link>
          </>
        )}
      </div>
    </div>
  )
}
