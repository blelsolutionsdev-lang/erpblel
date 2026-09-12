import { useQuery } from '@tanstack/react-query'
import { Boxes, Search, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useBuscaUrl, useFiltrosUrl } from '@/hooks/use-filtros-url'
import { formatDate, formatDateTime } from '@/lib/format'
import { situacaoValidade } from '@/lib/rastreio'
import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/database'

type LinhaLote = {
  lote_id: string
  codigo: string
  validade: string | null
  saldo: number
  produto: string
  unidade: string
}

type LinhaSerie = {
  id: string
  serie: string
  status: Enums<'serie_status'>
  produto: string
  cliente: string | null
}

type Rastro = {
  lote?: {
    codigo: string
    produto: string
    unidade: string
    fabricacao: string | null
    validade: string | null
    fornecedor: string | null
    nota: string | null
    saldo: number
  }
  movimentos?: {
    quando: string
    tipo: string
    quantidade: number
    origem_tipo: string | null
    os_numero: number | null
    cliente: string | null
    nota: string | null
    responsavel: string | null
    observacao: string | null
  }[]
  series?: { id: string; serie: string; status: string; cliente: string | null }[]
  serie?: {
    serie: string
    produto: string
    status: Enums<'serie_status'>
    fabricacao: string | null
    garantia_ate: string | null
    fornecedor: string | null
    cliente: string | null
    os_numero: number | null
    lote: { codigo: string; validade: string | null } | null
    entrada: { quando: string; origem_tipo: string | null } | null
    saida: { quando: string; origem_tipo: string | null } | null
  }
  historico?: { quando: string; acao: string; quem: string | null }[]
}

const rotuloStatusSerie: Record<Enums<'serie_status'>, string> = {
  em_estoque: 'em estoque',
  reservado: 'reservado',
  vendido: 'vendido',
  em_assistencia: 'em assistência',
  baixado: 'baixado',
}

const rotuloOrigem: Record<string, string> = {
  compra_xml: 'Entrada de NF-e',
  compra_pdf: 'Entrada de NF-e',
  compra_chave: 'Entrada de NF-e',
  os_baixa: 'Baixa de OS',
  os_estorno: 'Estorno de OS',
  kit_baixa: 'Cascata de kit',
  ajuste_manual: 'Ajuste manual',
}

function numero(v: number) {
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

/**
 * Rastreio de lote e número de série.
 *
 * Responde as perguntas que o razão de estoque sozinho não respondia: de que
 * compra veio esta unidade, para qual cliente foi, e o que ainda está parado
 * em estoque perto de vencer.
 */
export function Rastreio() {
  const { filtros, definir } = useFiltrosUrl({ q: '', aba: 'lotes', sel: '' })
  const { texto: busca, setTexto: setBusca } = useBuscaUrl(filtros.q, (q) => definir({ q, sel: '' }))
  const aba = filtros.aba === 'series' ? 'series' : 'lotes'

  const { data: lotes, isLoading: carregandoLotes } = useQuery({
    queryKey: ['rastreio-lotes', filtros.q],
    enabled: aba === 'lotes',
    queryFn: async () => {
      let query = supabase
        .from('vw_saldo_lotes')
        .select('lote_id, codigo, validade, saldo, produto_id')
        .order('validade', { ascending: true, nullsFirst: false })
        .limit(100)
      if (filtros.q.trim()) query = query.ilike('codigo', `%${filtros.q.trim()}%`)

      const { data, error } = await query
      if (error) throw error

      const ids = [...new Set((data ?? []).map((l) => l.produto_id).filter(Boolean))] as string[]
      const { data: produtos } = ids.length
        ? await supabase
            .from('produtos')
            .select('id, nome, unidade:unidades_medida(sigla)')
            .in('id', ids)
        : { data: [] }

      const mapa = new Map(
        ((produtos ?? []) as { id: string; nome: string; unidade: { sigla: string } | null }[]).map(
          (p) => [p.id, p],
        ),
      )

      return (data ?? []).map((l) => ({
        lote_id: l.lote_id as string,
        codigo: l.codigo as string,
        validade: l.validade,
        saldo: Number(l.saldo ?? 0),
        produto: mapa.get(l.produto_id as string)?.nome ?? '—',
        unidade: mapa.get(l.produto_id as string)?.unidade?.sigla ?? '',
      })) as LinhaLote[]
    },
  })

  const { data: series, isLoading: carregandoSeries } = useQuery({
    queryKey: ['rastreio-series', filtros.q],
    enabled: aba === 'series',
    queryFn: async () => {
      let query = supabase
        .from('numeros_serie')
        .select('id, serie, status, produto:produtos(nome), cliente:clientes(nome)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (filtros.q.trim()) query = query.ilike('serie', `%${filtros.q.trim()}%`)

      const { data, error } = await query
      if (error) throw error
      return (data as unknown as {
        id: string
        serie: string
        status: Enums<'serie_status'>
        produto: { nome: string } | null
        cliente: { nome: string } | null
      }[]).map((s) => ({
        id: s.id,
        serie: s.serie,
        status: s.status,
        produto: s.produto?.nome ?? '—',
        cliente: s.cliente?.nome ?? null,
      })) as LinhaSerie[]
    },
  })

  const { data: rastro, isLoading: carregandoRastro } = useQuery({
    queryKey: ['rastro', aba, filtros.sel],
    enabled: !!filtros.sel,
    queryFn: async () => {
      const { data, error } =
        aba === 'lotes'
          ? await supabase.rpc('rastrear_lote', { p_lote_id: filtros.sel })
          : await supabase.rpc('rastrear_serie', { p_serie_id: filtros.sel })
      if (error) throw error
      return data as unknown as Rastro
    },
  })

  return (
    <div>
      <PageHeader
        title="Rastreio"
        description="De que compra veio cada unidade, para qual cliente foi e o que está parado perto de vencer."
      />

      <Tabs value={aba} onValueChange={(v) => definir({ aba: v ?? 'lotes', sel: '' })}>
        <TabsList className="mb-3">
          <TabsTrigger value="lotes">
            <Boxes className="size-4" />
            Lotes
          </TabsTrigger>
          <TabsTrigger value="series">
            <ShieldCheck className="size-4" />
            Números de série
          </TabsTrigger>
        </TabsList>

        <div className="mb-3 relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={aba === 'lotes' ? 'Buscar por código do lote...' : 'Buscar por número de série...'}
            className="pl-8"
            aria-label={aba === 'lotes' ? 'Buscar lote' : 'Buscar número de série'}
          />
        </div>

        <TabsContent value="lotes">
          {carregandoLotes && <Skeleton className="h-24 w-full" />}
          {!carregandoLotes && lotes?.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhum lote ainda. Eles nascem na entrada de NF-e de produtos marcados como
                <strong> rastreio por lote</strong> no cadastro.
              </CardContent>
            </Card>
          )}
          <div className="space-y-1.5">
            {lotes?.map((l) => {
              const alerta = situacaoValidade(l.validade)
              return (
                <button
                  key={l.lote_id}
                  type="button"
                  onClick={() => definir({ sel: filtros.sel === l.lote_id ? '' : l.lote_id })}
                  aria-expanded={filtros.sel === l.lote_id}
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3 text-left text-sm hover:bg-muted/50 ${
                    filtros.sel === l.lote_id ? 'border-primary' : ''
                  }`}
                >
                  <span className="font-medium">{l.codigo}</span>
                  <span className="min-w-32 flex-1 truncate text-muted-foreground">{l.produto}</span>
                  {l.validade && (
                    <span className="text-xs text-muted-foreground">
                      validade {formatDate(l.validade)}
                    </span>
                  )}
                  {alerta && (
                    <Badge variant={alerta.critico ? 'destructive' : 'secondary'}>
                      {alerta.texto}
                    </Badge>
                  )}
                  <span className={`tabular-nums ${l.saldo <= 0 ? 'text-muted-foreground' : ''}`}>
                    {numero(l.saldo)} {l.unidade}
                  </span>
                </button>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="series">
          {carregandoSeries && <Skeleton className="h-24 w-full" />}
          {!carregandoSeries && series?.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhum número de série ainda. Eles nascem na entrada de NF-e de produtos marcados
                como <strong>rastreio por número de série</strong> no cadastro.
              </CardContent>
            </Card>
          )}
          <div className="space-y-1.5">
            {series?.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => definir({ sel: filtros.sel === s.id ? '' : s.id })}
                aria-expanded={filtros.sel === s.id}
                className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3 text-left text-sm hover:bg-muted/50 ${
                  filtros.sel === s.id ? 'border-primary' : ''
                }`}
              >
                <span className="font-medium">{s.serie}</span>
                <span className="min-w-32 flex-1 truncate text-muted-foreground">{s.produto}</span>
                {s.cliente && <span className="text-xs text-muted-foreground">{s.cliente}</span>}
                <Badge variant={s.status === 'em_estoque' ? 'secondary' : 'outline'}>
                  {rotuloStatusSerie[s.status]}
                </Badge>
              </button>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {filtros.sel && (
        <Card className="mt-4">
          <CardContent className="py-4">
            {carregandoRastro && <Skeleton className="h-24 w-full" />}

            {rastro?.lote && (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  <span className="font-medium">Lote {rastro.lote.codigo}</span>
                  <span className="text-muted-foreground">{rastro.lote.produto}</span>
                  {rastro.lote.fornecedor && (
                    <span className="text-muted-foreground">
                      fornecedor {rastro.lote.fornecedor}
                    </span>
                  )}
                  {rastro.lote.nota && (
                    <span className="text-muted-foreground">NF-e {rastro.lote.nota}</span>
                  )}
                  {rastro.lote.validade && (
                    <span className="text-muted-foreground">
                      validade {formatDate(rastro.lote.validade)}
                    </span>
                  )}
                  <span>
                    saldo <strong>{numero(rastro.lote.saldo)}</strong> {rastro.lote.unidade}
                  </span>
                </div>

                <div>
                  <p className="mb-1 font-medium">Movimentações</p>
                  {rastro.movimentos?.length === 0 && (
                    <p className="text-muted-foreground">Nenhuma movimentação.</p>
                  )}
                  <ul className="divide-y">
                    {rastro.movimentos?.map((m, i) => (
                      <li key={i} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(m.quando)}
                        </span>
                        <span
                          className={
                            m.tipo === 'entrada' ? 'text-emerald-600' : 'text-amber-600'
                          }
                        >
                          {m.tipo === 'entrada' ? '+' : '−'}
                          {numero(Math.abs(m.quantidade))}
                        </span>
                        <span className="min-w-32 flex-1">
                          {rotuloOrigem[m.origem_tipo ?? ''] ?? m.origem_tipo ?? '—'}
                          {m.os_numero && ` · OS #${m.os_numero}`}
                          {m.nota && ` · NF-e ${m.nota}`}
                          {m.cliente && ` · ${m.cliente}`}
                        </span>
                        {m.responsavel && (
                          <span className="text-xs text-muted-foreground">{m.responsavel}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {rastro.series && rastro.series.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">Números de série deste lote</p>
                    <p className="text-muted-foreground">
                      {rastro.series.map((s) => s.serie).join(' · ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {rastro?.serie && (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  <span className="font-medium">{rastro.serie.serie}</span>
                  <span className="text-muted-foreground">{rastro.serie.produto}</span>
                  <Badge variant={rastro.serie.status === 'em_estoque' ? 'secondary' : 'outline'}>
                    {rotuloStatusSerie[rastro.serie.status]}
                  </Badge>
                </div>

                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {rastro.serie.lote && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Lote</dt>
                      <dd>
                        {rastro.serie.lote.codigo}
                        {rastro.serie.lote.validade &&
                          ` · validade ${formatDate(rastro.serie.lote.validade)}`}
                      </dd>
                    </div>
                  )}
                  {rastro.serie.fornecedor && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Fornecedor</dt>
                      <dd>{rastro.serie.fornecedor}</dd>
                    </div>
                  )}
                  {rastro.serie.entrada && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Entrou em</dt>
                      <dd>
                        {formatDateTime(rastro.serie.entrada.quando)} ·{' '}
                        {rotuloOrigem[rastro.serie.entrada.origem_tipo ?? ''] ?? '—'}
                      </dd>
                    </div>
                  )}
                  {rastro.serie.saida && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Saiu em</dt>
                      <dd>
                        {formatDateTime(rastro.serie.saida.quando)} ·{' '}
                        {rotuloOrigem[rastro.serie.saida.origem_tipo ?? ''] ?? '—'}
                      </dd>
                    </div>
                  )}
                  {rastro.serie.cliente && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Cliente</dt>
                      <dd>{rastro.serie.cliente}</dd>
                    </div>
                  )}
                  {rastro.serie.os_numero && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">OS</dt>
                      <dd>#{rastro.serie.os_numero}</dd>
                    </div>
                  )}
                  {rastro.serie.garantia_ate && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Garantia até</dt>
                      <dd>{formatDate(rastro.serie.garantia_ate)}</dd>
                    </div>
                  )}
                </dl>

                <p className="text-xs text-muted-foreground">
                  Quem montou e com quais componentes chega com a ordem de produção — é ela que
                  grava o consumo de cada unidade.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
