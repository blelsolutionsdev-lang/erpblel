import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const TAMANHO_PAGINA = 50

/**
 * Estado de paginação + busca das listagens. As telas faziam `select('*')` sem
 * limite: funcionava com algumas dezenas de linhas e travava com milhares.
 */
export function usePaginacao(busca?: string) {
  const [pagina, setPagina] = useState(0)
  const [buscaAnterior, setBuscaAnterior] = useState(busca)

  // Trocar o termo de busca sempre volta para a primeira página, senão a lista
  // some (a página 3 do resultado antigo raramente existe no novo). Ajustar
  // durante a renderização evita o render extra de um efeito.
  if (busca !== buscaAnterior) {
    setBuscaAnterior(busca)
    setPagina(0)
  }

  return {
    pagina,
    setPagina,
    de: pagina * TAMANHO_PAGINA,
    ate: pagina * TAMANHO_PAGINA + TAMANHO_PAGINA - 1,
  }
}

export function Paginacao({
  pagina,
  setPagina,
  total,
  carregando,
}: {
  pagina: number
  setPagina: (p: number) => void
  total: number | null | undefined
  carregando?: boolean
}) {
  const totalConhecido = total ?? 0
  const ultimaPagina = Math.max(0, Math.ceil(totalConhecido / TAMANHO_PAGINA) - 1)
  const primeiro = totalConhecido === 0 ? 0 : pagina * TAMANHO_PAGINA + 1
  const ultimo = Math.min(totalConhecido, (pagina + 1) * TAMANHO_PAGINA)

  if (totalConhecido <= TAMANHO_PAGINA) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        {carregando ? 'Carregando...' : `${totalConhecido} registro(s)`}
      </p>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2">
      <p className="text-xs text-muted-foreground">
        {primeiro}–{ultimo} de {totalConhecido}
      </p>
      <div className="flex gap-1">
        <Button
          size="xs"
          variant="outline"
          disabled={pagina === 0 || carregando}
          onClick={() => setPagina(pagina - 1)}
        >
          <ChevronLeft className="size-3.5" />
          Anterior
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={pagina >= ultimaPagina || carregando}
          onClick={() => setPagina(pagina + 1)}
        >
          Próxima
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
