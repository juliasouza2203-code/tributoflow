import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import type { AppRole } from '@/integrations/supabase/types'

interface Profile {
  id: string
  office_id: string | null
  full_name: string
  email: string
  avatar_url: string | null
}

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  roles: AppRole[]
  officeId: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  isOfficeStaff: boolean
  isCompanyUser: boolean
  isOfficeOwner: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [officeId, setOfficeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    }).catch(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else {
        setProfile(null)
        setRoles([])
        setOfficeId(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single() as any

      if (profileData) {
        setProfile(profileData as Profile)
        setOfficeId((profileData as any).office_id)
      }

      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId) as any

      if (rolesData) setRoles((rolesData as any[]).map((r: any) => r.role))
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return { error: error as Error | null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await loadProfile(session.user.id)
  }

  const isOfficeOwner = roles.includes('office_owner')
  const isOfficeStaff = roles.includes('office_staff') || isOfficeOwner
  const isCompanyUser = roles.includes('company_user')

  return (
    <AuthContext.Provider value={{
      session, user, profile, roles, officeId, loading,
      signIn, signUp, signOut, refreshProfile,
      isOfficeStaff, isCompanyUser, isOfficeOwner,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
