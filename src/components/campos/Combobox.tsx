import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { cn } from 'cn'
import { useDebounce } from '@/hooks/use-debounce'

export type OpcaoCombobox = { value: string; label: string; descricao?: string }

/**
 * Seletor com busca feita no servidor.
 *
 * Os selects do app carregavam a base inteira (até 2.000 produtos) numa lista
 * rolável sem busca: escolher uma peça virava garimpo. Aqui só chegam as
 * opções que combinam com o que foi digitado.
 */
export function Combobox({
  valor,
  aoSelecionar,
  buscar,
  carregarSelecionado,
  placeholder = 'Selecione...',
  vazio = 'Nada encontrado.',
  disabled,
  limparRotulo = 'Limpar seleção',
  permiteLimpar = true,
  className,
  id,
  queryKey,
}: {
  valor: string
  aoSelecionar: (valor: string, opcao?: OpcaoCombobox) => void
  /** Busca no servidor. Recebe o termo digitado (pode vir vazio). */
  buscar: (termo: string) => Promise<OpcaoCombobox[]>
  /** Carrega o rótulo do item já selecionado (ex.: ao abrir um registro salvo). */
  carregarSelecionado?: (valor: string) => Promise<OpcaoCombobox | null>
  placeholder?: string
  vazio?: string
  disabled?: boolean
  limparRotulo?: string
  permiteLimpar?: boolean
  className?: string
  id?: string
  /** Prefixo do cache; precisa ser único por fonte de dados. */
  queryKey: string
}) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [destaque, setDestaque] = useState(0)
  const [selecionado, setSelecionado] = useState<OpcaoCombobox | null>(null)
  const termoDebounced = useDebounce(termo, 250)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaId = useId()

  const { data: opcoes, isFetching } = useQuery({
    queryKey: [queryKey, 'combobox', termoDebounced],
    queryFn: () => buscar(termoDebounced),
    enabled: aberto,
    staleTime: 30_000,
  })

  // O rótulo do valor já salvo não vem da busca: precisa ser carregado à parte.
  useEffect(() => {
    let ativo = true
    if (!valor) {
      setSelecionado(null)
      return
    }
    if (selecionado?.value === valor) return

    if (carregarSelecionado) {
      void carregarSelecionado(valor).then((opcao) => {
        if (ativo && opcao) setSelecionado(opcao)
      })
    }
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  useEffect(() => {
    if (aberto) {
      setTermo('')
      setDestaque(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [aberto])

  const lista = opcoes ?? []

  function escolher(opcao: OpcaoCombobox) {
    setSelecionado(opcao)
    aoSelecionar(opcao.value, opcao)
    setAberto(false)
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDestaque((d) => Math.min(d + 1, lista.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDestaque((d) => Math.max(d - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opcao = lista[destaque]
      if (opcao) escolher(opcao)
    } else if (e.key === 'Escape') {
      setAberto(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? listaId : undefined}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn('truncate', !selecionado && 'text-muted-foreground')}>
          {selecionado?.label ?? placeholder}
        </span>
        <span className="flex items-center gap-1">
          {permiteLimpar && selecionado && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={limparRotulo}
              title={limparRotulo}
              className="rounded p-0.5 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation()
                setSelecionado(null)
                aoSelecionar('')
              }}
            >
              <X className="size-3.5 text-muted-foreground" />
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </span>
      </button>

      {aberto && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value)
                setDestaque(0)
              }}
              onKeyDown={aoTeclar}
              placeholder="Digite para buscar..."
              className="h-9 w-full bg-transparent text-sm outline-none"
              aria-autocomplete="list"
              aria-controls={listaId}
            />
            {isFetching && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
          </div>

          <ul id={listaId} role="listbox" className="max-h-60 overflow-y-auto p-1">
            {lista.length === 0 && !isFetching && (
              <li className="px-2 py-3 text-center text-sm text-muted-foreground">{vazio}</li>
            )}
            {lista.map((opcao, i) => (
              <li key={opcao.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={opcao.value === valor}
                  onMouseEnter={() => setDestaque(i)}
                  onClick={() => escolher(opcao)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                    i === destaque && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{opcao.label}</span>
                    {opcao.descricao && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {opcao.descricao}
                      </span>
                    )}
                  </span>
                  {opcao.value === valor && <Check className="size-4 shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
