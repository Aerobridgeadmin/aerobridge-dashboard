'use client'

import { useAuth } from '@/contexts/AuthContext'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import { Loader2 } from 'lucide-react'

const publicRoutes = ['/login', '/signup', '/forgot-password', '/auth/confirm']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isPublicRoute = publicRoutes.some(r => pathname.startsWith(r))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user && !isPublicRoute) {
      router.replace('/login')
    }
    if (user && (pathname === '/login' || pathname === '/signup')) {
      router.replace('/')
    }
    if (user && profile && !profile.onboarding_complete && pathname !== '/onboarding') {
      router.replace('/onboarding')
    }
  }, [user, profile, loading, pathname, router, isPublicRoute])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-4">
          <img src="/images/logo.png" alt="AeroBridge" className="h-12 object-contain" />
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      </div>
    )
  }

  if (isPublicRoute || pathname === '/onboarding') {
    return <>{children}</>
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-[68px]' : 'ml-[250px]'}`}>
        {children}
      </main>
    </div>
  )
}
