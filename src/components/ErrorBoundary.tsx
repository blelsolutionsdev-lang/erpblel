import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Sem isso, qualquer erro não tratado durante a renderização (uma query que
 * estoura, um campo inesperado vindo do banco) derruba a aplicação inteira
 * para uma tela branca, sem pista nenhuma para o usuário.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro não tratado na interface:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <TriangleAlert className="size-8 text-destructive" />
        <p className="text-lg font-medium">Algo deu errado nesta tela</p>
        <p className="max-w-md text-sm text-muted-foreground">{this.state.error.message}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            Tentar de novo
          </Button>
          <Button onClick={() => window.location.assign('/')}>Voltar ao início</Button>
        </div>
      </div>
    )
  }
}
