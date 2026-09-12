import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Paginacao } from '@/components/Paginacao'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFiltrosUrl } from '@/hooks/use-filtros-url'
import { formatCurrency, formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type Movimento = Tables<'caixa_movimentacoes'> & {
  autor: Pick<Tables<'profiles'>, 'id' | 'nome'> | null
}

function primeiroDiaDoMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

/**
 * Fluxo de caixa alimentado pelas baixas de títulos. A tabela existia desde o
 * início e nunca recebia lançamento nenhum.
 */
export function Caixa() {
  const {
    filtros,
    definir,
    pagina,
    setPagina,
    de: rangeDe,
    ate: rangeAte,
  } = useFiltrosUrl({ de: primeiroDiaDoMes(), ate: new Date().toISOString().slice(0, 10) })
  const { de, ate } = filtros

  const {
    data: resultado,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['caixa', de, ate, pagina],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('caixa_movimentacoes')
        .select('*, autor:profiles(id, nome)', { count: 'exact' })
        .gte('data_movimento', de)
        .lte('data_movimento', ate)
        .order('data_movimento', { ascending: false })
        .order('created_at', { ascending: false })
        .range(rangeDe, rangeAte)
      if (error) throw error
      return { linhas: data as unknown as Movimento[], total: count }
    },
  })

  // Somatório feito no banco: antes a tela consultava o mesmo período duas
  // vezes, uma paginada para a lista e outra inteira só para somar.
  const { data: totais } = useQuery({
    queryKey: ['caixa-totais', de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('totais_caixa', { p_de: de, p_ate: ate })
      if (error) throw error
      return data as unknown as { entradas: number; saidas: number; saldo: number }
    },
  })

  const movimentos = resultado?.linhas

  return (
    <div>
      <PageHeader
        title="Caixa"
        description="Entradas e saídas efetivas, lançadas automaticamente a cada baixa de título"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="caixa_de" className="text-xs text-muted-foreground">
            De
          </Label>
          <Input id="caixa_de" type="date" value={de} onChange={(e) => definir({ de: e.target.value })} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="caixa_ate" className="text-xs text-muted-foreground">
            Até
          </Label>
          <Input id="caixa_ate" type="date" value={ate} onChange={(e) => definir({ ate: e.target.value })} className="h-8" />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entradas</CardTitle>
            <ArrowDownLeft className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totais?.entradas)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saídas</CardTitle>
            <ArrowUpRight className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(totais?.saidas)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo do período</CardTitle>
            <Wallet className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totais?.saldo)}</div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        linhas={movimentos}
        carregando={isLoading}
        chave={(mov) => mov.id}
        vazio="Nenhum lançamento no período."
        colunas={[
          {
            titulo: 'Descrição',
            mobile: 'titulo',
            celula: (mov) => (
              <div className="flex items-center gap-2">
                <Badge variant={mov.tipo === 'entrada' ? 'default' : 'secondary'} className="gap-1">
                  {mov.tipo === 'entrada' ? (
                    <ArrowDownLeft className="size-3" />
                  ) : (
                    <ArrowUpRight className="size-3" />
                  )}
                  {mov.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                </Badge>
                <span className="min-w-0 truncate">{mov.descricao ?? '—'}</span>
              </div>
            ),
          },
          { titulo: 'Data', celula: (mov) => formatDate(mov.data_movimento) },
          { titulo: 'Forma', celula: (mov) => mov.forma_pagamento ?? '—' },
          { titulo: 'Responsável', celula: (mov) => mov.autor?.nome ?? '—' },
          {
            titulo: 'Valor',
            alinhar: 'direita',
            celula: (mov) => (
              <span
                className={`font-medium ${
                  mov.tipo === 'entrada' ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {mov.tipo === 'entrada' ? '+' : '−'}
                {formatCurrency(mov.valor)}
              </span>
            ),
          },
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
