import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type Tema = 'light' | 'dark' | 'system'

const CHAVE = 'erpblel-tema'

type TemaContextValue = {
  theme: Tema
  /** O tema realmente aplicado (resolve 'system' para claro/escuro). */
  resolvedTheme: 'light' | 'dark'
  setTheme: (tema: Tema) => void
}

const TemaContext = createContext<TemaContextValue | undefined>(undefined)

function preferenciaDoSistema(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function lerTemaSalvo(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE)
    if (salvo === 'light' || salvo === 'dark' || salvo === 'system') return salvo
  } catch {
    // localStorage bloqueado (janela anônima, política do navegador)
  }
  return 'system'
}

/**
 * Provider próprio no lugar do next-themes.
 *
 * O next-themes injeta um `<script>` no corpo do componente para evitar o
 * flash em SSR; num SPA isso não faz nada além de disparar um aviso do React a
 * cada render. Aqui o anti-flash fica no index.html, onde é o lugar dele.
 */
export function TemaProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeEstado] = useState<Tema>(lerTemaSalvo)
  const [sistema, setSistema] = useState<'light' | 'dark'>(() =>
    typeof window === 'undefined' ? 'light' : preferenciaDoSistema(),
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const aoMudar = () => setSistema(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', aoMudar)
    return () => mq.removeEventListener('change', aoMudar)
  }, [])

  const resolvedTheme = theme === 'system' ? sistema : theme

  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.toggle('dark', resolvedTheme === 'dark')
    raiz.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = useCallback((novo: Tema) => {
    setThemeEstado(novo)
    try {
      localStorage.setItem(CHAVE, novo)
    } catch {
      // sem persistência: o tema vale só para esta sessão
    }
  }, [])

  const valor = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTema() {
  const ctx = useContext(TemaContext)
  if (!ctx) throw new Error('useTema deve ser usado dentro de <TemaProvider>')
  return ctx
}
