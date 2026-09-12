import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Paginacao, usePaginacao } from '@/components/Paginacao'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  const [de, setDe] = useState(primeiroDiaDoMes)
  const [ate, setAte] = useState(() => new Date().toISOString().slice(0, 10))
  const { pagina, setPagina, de: rangeDe, ate: rangeAte } = usePaginacao(`${de}|${ate}`)

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

  const { data: totais } = useQuery({
    queryKey: ['caixa-totais', de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('caixa_movimentacoes')
        .select('tipo, valor')
        .gte('data_movimento', de)
        .lte('data_movimento', ate)
      if (error) throw error
      const entradas = (data ?? [])
        .filter((m) => m.tipo === 'entrada')
        .reduce((acc, m) => acc + Number(m.valor), 0)
      const saidas = (data ?? [])
        .filter((m) => m.tipo === 'saida')
        .reduce((acc, m) => acc + Number(m.valor), 0)
      return { entradas, saidas, saldo: entradas - saidas }
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
          <Input id="caixa_de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="caixa_ate" className="text-xs text-muted-foreground">
            Até
          </Label>
          <Input id="caixa_ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-8" />
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && movimentos?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum lançamento no período.
                </TableCell>
              </TableRow>
            )}

            {movimentos?.map((mov) => (
              <TableRow key={mov.id}>
                <TableCell className="whitespace-nowrap">{formatDate(mov.data_movimento)}</TableCell>
                <TableCell>
                  <Badge variant={mov.tipo === 'entrada' ? 'default' : 'secondary'} className="mr-2 gap-1">
                    {mov.tipo === 'entrada' ? (
                      <ArrowDownLeft className="size-3" />
                    ) : (
                      <ArrowUpRight className="size-3" />
                    )}
                    {mov.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                  </Badge>
                  {mov.descricao ?? '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {mov.forma_pagamento ?? '—'}
                </TableCell>
                <TableCell className="text-sm">{mov.autor?.nome ?? '—'}</TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    mov.tipo === 'entrada' ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {mov.tipo === 'entrada' ? '+' : '−'}
                  {formatCurrency(mov.valor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Paginacao
        pagina={pagina}
        setPagina={setPagina}
        total={resultado?.total}
        carregando={isFetching}
      />
    </div>
  )
}
