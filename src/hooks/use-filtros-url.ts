import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '@/hooks/use-debounce'

export const TAMANHO_PAGINA = 50

/**
 * Busca, filtros e página passam a viver na URL.
 *
 * Antes tudo era estado local: dar F5, mandar o link para um colega ou usar o
 * "voltar" do navegador perdia o filtro e a página em que a pessoa estava.
 */
export function useFiltrosUrl<T extends Record<string, string>>(padroes: T) {
  const [params, setParams] = useSearchParams()
  // Os padrões são fixos na vida do componente: guardar o primeiro valor evita
  // recriar os filtros a cada render por causa do objeto literal do chamador.
  const [padroesIniciais] = useState(padroes)

  const filtros = useMemo(() => {
    const atual = { ...padroesIniciais }
    for (const chave of Object.keys(padroesIniciais) as (keyof T)[]) {
      const valor = params.get(String(chave))
      if (valor !== null) atual[chave] = valor as T[keyof T]
    }
    return atual
  }, [params, padroesIniciais])

  const definir = useCallback(
    (novos: Partial<Record<keyof T, string>>, opcoes?: { manterPagina?: boolean }) => {
      setParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores)
          for (const [chave, valor] of Object.entries(novos)) {
            if (!valor || valor === padroesIniciais[chave as keyof T]) proximos.delete(chave)
            else proximos.set(chave, valor)
          }
          // Mudar filtro sem voltar para a página 1 mostraria uma lista vazia.
          if (!opcoes?.manterPagina) proximos.delete('pagina')
          return proximos
        },
        { replace: true },
      )
    },
    [setParams, padroesIniciais],
  )

  const pagina = Math.max(0, Number(params.get('pagina') ?? '0') || 0)

  const setPagina = useCallback(
    (p: number) =>
      setParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores)
          if (p <= 0) proximos.delete('pagina')
          else proximos.set('pagina', String(p))
          return proximos
        },
        { replace: true },
      ),
    [setParams],
  )

  return {
    filtros,
    definir,
    pagina,
    setPagina,
    de: pagina * TAMANHO_PAGINA,
    ate: pagina * TAMANHO_PAGINA + TAMANHO_PAGINA - 1,
  }
}

/**
 * Campo de busca ligado à URL: o input responde na hora, a URL (e a query) só
 * depois que a pessoa para de digitar.
 */
export function useBuscaUrl(valorUrl: string, aoMudar: (valor: string) => void) {
  const [texto, setTexto] = useState(valorUrl)
  const termo = useDebounce(texto, 300)
  const ultimoEnviado = useRef(valorUrl)

  useEffect(() => {
    if (termo !== ultimoEnviado.current) {
      ultimoEnviado.current = termo
      aoMudar(termo)
    }
  }, [termo, aoMudar])

  // Navegação externa (voltar do navegador, link colado) reflete no campo.
  useEffect(() => {
    if (valorUrl !== ultimoEnviado.current) {
      ultimoEnviado.current = valorUrl
      setTexto(valorUrl)
    }
  }, [valorUrl])

  return { texto, setTexto, termo }
}
