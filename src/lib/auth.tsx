import type { Session, User } from '@supabase/supabase-js'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import type { Permissao } from '@/lib/permissoes'

type Profile = Tables<'profiles'> & { role: Tables<'roles'> | null }

type AuthContextValue = {
  user: User | null
  session: Session | null
  profile: Profile | null
  /** Sessão ainda sendo resolvida (antes de saber se há usuário logado). */
  loading: boolean
  /** Perfil + permissões já carregados: só depois disso a UI pode decidir o que esconder. */
  pronto: boolean
  permissoes: Set<string>
  permissoesCarregadas: boolean
  hasPermission: (chave: Permissao) => boolean
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

  // O objeto `session` é recriado a cada refresh de token (~1h). Depender do id
  // evita recarregar perfil e permissões (e piscar a UI) a cada renovação.
  const userId = session?.user?.id ?? null

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return
      setSession(newSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const carregarProfile = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*, role:roles(*)')
      .eq('id', id)
      .maybeSingle()
    return (data as Profile | null) ?? null
  }, [])

  useEffect(() => {
    let active = true

    if (!userId) {
      setProfile(null)
      setPermissoes(new Set())
      setPermissoesCarregadas(false)
      return
    }

    setPermissoesCarregadas(false)

    async function carregar(id: string) {
      try {
        await carregarPerfilEPermissoes(id)
      } catch (err) {
        // Falha de rede ao carregar perfil/permissões não pode deixar o app
        // preso na tela de "Carregando..." para sempre: libera a renderização
        // sem permissão nenhuma, e a própria tela mostra o erro.
        console.error('Falha ao carregar perfil e permissões:', err)
        if (active) {
          setPermissoes(new Set())
          setPermissoesCarregadas(true)
        }
      }
    }

    async function carregarPerfilEPermissoes(id: string) {
      const perfil = await carregarProfile(id)
      if (!active) return

      setProfile(perfil)

      // Conta desativada no ERP continua com sessão válida no Supabase Auth:
      // sem este corte, o usuário seguiria "dentro" do sistema (só esbarrando
      // em erros de RLS). Derruba a sessão e explica o motivo.
      if (perfil && !perfil.ativo) {
        toast.error('Seu acesso foi desativado. Procure um administrador.')
        await supabase.auth.signOut()
        return
      }

      const [papel, overrides] = await Promise.all([
        perfil?.role_id
          ? supabase
              .from('role_permissions')
              .select('permission:permissions(chave)')
              .eq('role_id', perfil.role_id)
          : Promise.resolve({ data: [] as { permission: { chave: string } | null }[] }),
        supabase
          .from('user_permissions')
          .select('allow, permission:permissions(chave)')
          .eq('user_id', id),
      ])

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
    }

    void carregar(userId)

    return () => {
      active = false
    }
  }, [userId, carregarProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!userId) return
    setProfile(await carregarProfile(userId))
  }, [userId, carregarProfile])

  const hasPermission = useCallback((chave: Permissao) => permissoes.has(chave), [permissoes])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      loading,
      pronto: !loading && (!session?.user || permissoesCarregadas),
      permissoes,
      permissoesCarregadas,
      hasPermission,
      signIn,
      signOut,
      refreshProfile,
    }),
    [
      session,
      profile,
      loading,
      permissoes,
      permissoesCarregadas,
      hasPermission,
      signIn,
      signOut,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
