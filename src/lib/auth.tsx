import type { Session, User } from '@supabase/supabase-js'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type Profile = Tables<'profiles'> & { role: Tables<'roles'> | null }

type AuthContextValue = {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  permissoes: Set<string>
  permissoesCarregadas: boolean
  hasPermission: (chave: string) => boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [permissoes, setPermissoes] = useState<Set<string>>(new Set())
  const [permissoesCarregadas, setPermissoesCarregadas] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function carregarProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*, role:roles(*)')
      .eq('id', userId)
      .maybeSingle()
    setProfile(data as Profile | null)
    return data as Profile | null
  }

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setPermissoes(new Set())
      setPermissoesCarregadas(false)
      return
    }

    carregarProfile(session.user.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user])

  useEffect(() => {
    let active = true

    if (!session?.user || !profile) {
      return
    }

    setPermissoesCarregadas(false)

    Promise.all([
      profile.role_id
        ? supabase
            .from('role_permissions')
            .select('permission:permissions(chave)')
            .eq('role_id', profile.role_id)
        : Promise.resolve({ data: [] as { permission: { chave: string } | null }[] }),
      supabase
        .from('user_permissions')
        .select('allow, permission:permissions(chave)')
        .eq('user_id', session.user.id),
    ]).then(([papel, overrides]) => {
      if (!active) return
      const set = new Set<string>()
      for (const row of papel.data ?? []) {
        if (row.permission?.chave) set.add(row.permission.chave)
      }
      for (const row of overrides.data ?? []) {
        if (!row.permission?.chave) continue
        if (row.allow) set.add(row.permission.chave)
        else set.delete(row.permission.chave)
      }
      setPermissoes(set)
      setPermissoesCarregadas(true)
    })

    return () => {
      active = false
    }
  }, [session?.user, profile])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (session?.user) await carregarProfile(session.user.id)
  }

  function hasPermission(chave: string) {
    return permissoes.has(chave)
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        loading,
        permissoes,
        permissoesCarregadas,
        hasPermission,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
