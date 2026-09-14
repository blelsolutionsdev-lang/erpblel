import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { TrocarSenhaObrigatoria } from '@/components/TrocarSenhaObrigatoria'
import type { Permissao } from '@/lib/permissoes'

function Carregando() {
  return (
    <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
      Carregando...
    </div>
  )
}

export function ProtectedRoute({
  children,
  permissao,
}: {
  children: ReactNode
  /** Quando informada, a rota só abre para quem tem a permissão. */
  permissao?: Permissao
}) {
  const { user, profile, loading, pronto, hasPermission } = useAuth()

  if (loading) return <Carregando />

  if (!user) return <Navigate to="/login" replace />

  // Espera perfil e permissões antes de renderizar: sem isso a tela aparece
  // por um instante como se o usuário não tivesse permissão nenhuma.
  if (!pronto) return <Carregando />

  // Quem entrou com senha provisória não navega em nada antes de trocá-la.
  if (profile?.deve_trocar_senha) return <TrocarSenhaObrigatoria />

  if (permissao && !hasPermission(permissao)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center text-muted-foreground">
        <ShieldOff className="size-8" />
        <p className="font-medium text-foreground">Acesso negado</p>
        <p className="max-w-md text-sm">
          Você não tem a permissão necessária para acessar esta tela. Fale com um administrador se
          precisar dela.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
