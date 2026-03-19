'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

export interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  role: 'admin' | 'instructor' | 'student'
  department?: string
  phone?: string
  bio?: string
  onboarding_complete: boolean
  created_at: string
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signInWithGoogle: () => Promise<{ error: any }>
  signUp: (email: string, password: string, meta: { full_name: string; role?: string }) => Promise<{ error: any }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: any }>
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>
  isAdmin: boolean
  isInstructor: boolean
  isStudent: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data as Profile)
      return data
    }

    // Auto-create profile for OAuth users (Google SSO)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      const meta = authUser.user_metadata
      const email = authUser.email || ''
      const isAerobridgeDomain = email.endsWith('@aerobridge.cl')

      const newProfile = {
        id: userId,
        email,
        full_name: meta?.full_name || meta?.name || email.split('@')[0] || 'User',
        avatar_url: meta?.avatar_url || meta?.picture,
        role: isAerobridgeDomain ? 'admin' : 'student',
        onboarding_complete: false,
      }
      const { data: created } = await supabase.from('profiles').insert(newProfile).select().single()
      if (created) setProfile(created as Profile)
      return created
    }
    return null
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) fetchProfile(user.id).then(() => setLoading(false))
      else setLoading(false)
    })

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          await fetchProfile(currentUser.id)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
        queryParams: { access_type: 'offline', prompt: 'consent', hd: 'aerobridge.cl' },
      },
    })
    return { error }
  }

  const signUp = async (email: string, password: string, meta: { full_name: string; role?: string }) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: meta.full_name, role: 'student' } },
    })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/settings`,
    })
    return { error }
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: 'Not authenticated' }
    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (!error) await fetchProfile(user.id)
    return { error }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signIn,
        signInWithGoogle,
        signUp,
        signOut,
        resetPassword,
        updateProfile,
        isAdmin: profile?.role === 'admin',
        isInstructor: profile?.role === 'instructor',
        isStudent: profile?.role === 'student',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
