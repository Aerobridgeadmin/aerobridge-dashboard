'use client'
import { useAuth } from '@/contexts/AuthContext'
import { ShieldAlert } from 'lucide-react'
import Link from 'next/link'

interface RoleGuardProps {
  children: React.ReactNode
  allowed: ('admin' | 'instructor' | 'student')[]
  fallback?: React.ReactNode
}

// Wrap pages that need role restriction
export default function RoleGuard({ children, allowed, fallback }: RoleGuardProps) {
  const { profile } = useAuth()
  if (!profile) return null
  if (allowed.includes(profile.role)) return <>{children}</>

  return fallback ? <>{fallback}</> : (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-50 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cta-500/10">
        <ShieldAlert className="h-8 w-8 text-cta-500" />
      </div>
      <h2 className="mt-5 text-xl font-extrabold text-surface-800">Access Restricted</h2>
      <p className="mt-2 max-w-sm text-sm text-surface-500">
        Your role (<span className="font-semibold capitalize">{profile.role}</span>) does not have permission to view this page.
      </p>
      <Link href="/" className="mt-6 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
        Back to Dashboard
      </Link>
    </div>
  )
}

// Inline guard: only show content if user has required role
export function RoleVisible({ children, roles }: { children: React.ReactNode; roles: ('admin' | 'instructor' | 'student')[] }) {
  const { profile } = useAuth()
  if (!profile || !roles.includes(profile.role)) return null
  return <>{children}</>
}
