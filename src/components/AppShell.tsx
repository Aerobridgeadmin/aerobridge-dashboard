'use client'

import { useAuth } from '@/contexts/AuthContext'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import { Loader2, Plane } from 'lucide-react'

const publicRoutes = ['/login', '/signup', '/forgot-password']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isPublicRoute = publicRoutes.includes(pathname)

  useEffect(() => {
    if (loading) return
    if (!user && !isPublicRoute) {
      router.replace('/login')
    }
    if (user && isPublicRoute) {
      router.replace('/')
    }
    if (user && profile && !profile.onboarding_complete && pathname !== '/onboarding') {
      router.replace('/onboarding')
    }
  }, [user, profile, loading, pathname, router, isPublicRoute])

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: '#0B3D91' }}>
            <Plane className="h-6 w-6 text-white" />
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      </div>
    )
  }

  // Public routes (login, signup, forgot-password) — no sidebar
  if (isPublicRoute || pathname === '/onboarding') {
    return <>{children}</>
  }

  // Not logged in — don't render anything (redirect happening)
  if (!user) return null

  // Authenticated layout with sidebar
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[250px] flex-1 transition-all duration-300">
        {children}
      </main>
    </div>
  )
}
