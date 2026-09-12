import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Paginacao } from '@/components/Paginacao'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBuscaUrl, useFiltrosUrl } from '@/hooks/use-filtros-url'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Enums, Tables } from '@/types/database'

type Movimentacao = Tables<'movimentacoes_estoque'> & {
  produto: Pick<Tables<'produtos'>, 'id' | 'nome' | 'sku'> | null
  autor: Pick<Tables<'profiles'>, 'id' | 'nome'> | null
}

type TipoMov = Enums<'movimento_estoque_tipo'>

const tipoLabel: Record<TipoMov, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
  transferencia: 'Transferência',
}

const origemLabel: Record<string, string> = {
  compra_xml: 'NF-e (XML)',
  compra_pdf: 'NF-e (PDF)',
  compra_chave: 'NF-e (chave)',
  os_baixa: 'Baixa de OS',
  kit_baixa: 'Componente de kit',
  ajuste_manual: 'Ajuste manual',
}

export function Movimentacoes() {
  const { filtros, definir, pagina, setPagina, de, ate } = useFiltrosUrl({ q: '', tipo: '' })
  const { texto: busca, setTexto: setBusca } = useBuscaUrl(filtros.q, (q) => definir({ q }))
  const tipo = filtros.tipo as '' | TipoMov

  const {
    data: resultado,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['movimentacoes_estoque', filtros.q, tipo, pagina],
    queryFn: async () => {
      const termo = filtros.q.trim()

      let query = supabase
        .from('movimentacoes_estoque')
        .select(
          termo
            ? '*, produto:produtos!inner(id, nome, sku), autor:profiles(id, nome)'
            : '*, produto:produtos(id, nome, sku), autor:profiles(id, nome)',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(de, ate)

      if (termo) query = query.ilike('produto.nome', `%${termo}%`)
      if (tipo) query = query.eq('tipo', tipo)

      const { data, error, count } = await query
      if (error) throw error
      return { linhas: data as unknown as Movimentacao[], total: count }
    },
  })

  const movimentacoes = resultado?.linhas

  return (
    <div>
      <PageHeader
        title="Movimentações de estoque"
        description="Razão de estoque: toda entrada de NF-e, baixa de peça em OS e ajuste manual aparece aqui. Os lançamentos não podem ser editados nem apagados — correções entram como novo ajuste."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por produto..."
            className="pl-8"
          />
        </div>
        <Select
          items={[
            { value: 'todos', label: 'Todos os tipos' },
            ...(Object.keys(tipoLabel) as TipoMov[]).map((t) => ({ value: t, label: tipoLabel[t] })),
          ]}
          value={tipo || 'todos'}
          onValueChange={(v) => definir({ tipo: !v || v === 'todos' ? '' : v })}
        >
          <SelectTrigger className="w-52">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {(Object.keys(tipoLabel) as TipoMov[]).map((t) => (
              <SelectItem key={t} value={t}>
                {tipoLabel[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        linhas={movimentacoes}
        carregando={isLoading}
        chave={(mov) => mov.id}
        vazio="Nenhuma movimentação encontrada."
        colunas={[
          {
            titulo: 'Produto',
            mobile: 'titulo',
            celula: (mov) => (
              <div>
                <div className="font-medium">{mov.produto?.nome ?? '—'}</div>
                {mov.observacao && (
                  <div className="text-xs text-muted-foreground">{mov.observacao}</div>
                )}
              </div>
            ),
          },
          { titulo: 'Data', celula: (mov) => formatDateTime(mov.created_at) },
          {
            titulo: 'Tipo',
            celula: (mov) => {
              const entrada = mov.tipo === 'entrada' || (mov.tipo === 'ajuste' && mov.quantidade >= 0)
              return (
                <Badge variant={entrada ? 'default' : 'secondary'} className="gap-1">
                  {entrada ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                  {tipoLabel[mov.tipo]}
                </Badge>
              )
            },
          },
          {
            titulo: 'Quantidade',
            alinhar: 'direita',
            celula: (mov) => {
              const entrada = mov.tipo === 'entrada' || (mov.tipo === 'ajuste' && mov.quantidade >= 0)
              return (
                <span className={`font-medium ${entrada ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {entrada ? '+' : '−'}
                  {Math.abs(mov.quantidade)}
                </span>
              )
            },
          },
          {
            titulo: 'Custo unit.',
            alinhar: 'direita',
            celula: (mov) => (mov.preco_unitario != null ? formatCurrency(mov.preco_unitario) : '—'),
          },
          {
            titulo: 'Origem',
            celula: (mov) => (mov.origem_tipo ? (origemLabel[mov.origem_tipo] ?? mov.origem_tipo) : '—'),
          },
          { titulo: 'Responsável', celula: (mov) => mov.autor?.nome ?? '—' },
        ]}
      />

      <Paginacao
        pagina={pagina}
        setPagina={setPagina}
        total={resultado?.total}
        carregando={isFetching}
      />
    </div>
  )
}
