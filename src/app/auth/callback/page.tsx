'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_IN' && session) {
          const email = session.user?.email || ''
          if (session.user?.app_metadata?.provider === 'google' && !email.endsWith('@aerobridge.cl')) {
            supabase.auth.signOut()
            router.replace('/login?error=domain_restricted')
          } else {
            router.replace('/')
          }
        } else if (event === 'SIGNED_OUT') {
          router.replace('/login?error=oauth_failed')
        }
      }
    )

    const timeout = setTimeout(() => {
      router.replace('/login?error=oauth_failed')
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50">
      <div className="flex flex-col items-center gap-3">
        <img src="/images/logo.png" alt="AeroBridge" className="h-10 object-contain" />
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        <p className="text-sm text-surface-500">Signing you in...</p>
      </div>
    </div>
  )
}
