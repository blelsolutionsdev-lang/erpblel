import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  PackageCheck,
  ReceiptText,
  Warehouse,
  Wrench,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { rotuloOrigem } from '@/lib/estoque'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDateTime } from '@/lib/format'

type ItemReposicao = {
  id: string
  nome: string
  unidade: string
  saldo: number
  minimo: number
  comprometido: number
  disponivel: number
  falta: number
}

type Movimentacao = {
  quando: string
  produto: string
  tipo: 'entrada' | 'saida' | 'ajuste' | 'transferencia'
  quantidade: number
  origem: string
}

type Resumo = {
  total_produtos: number
  produtos_abaixo_minimo: number
  produtos_sem_saldo: number
  os_abertas: number
  ver_financeiro: boolean
  ver_valor_estoque: boolean
  valor_estoque: number | null
  total_receber: number | null
  total_pagar: number | null
  reposicao: ItemReposicao[]
  ultimas_movimentacoes: Movimentacao[]
}

function Metrica({
  titulo,
  icone: Icone,
  valor,
  legenda,
  carregando,
  destaque,
}: {
  titulo: string
  icone: typeof Boxes
  valor: string | number | undefined | null
  legenda: string
  carregando: boolean
  destaque?: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <Icone className={`size-4 ${destaque ? 'text-amber-500' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        {carregando ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className={`text-2xl font-bold ${destaque ? 'text-amber-600' : ''}`}>{valor}</div>
        )}
        <p className="text-xs text-muted-foreground">{carregando ? '' : legenda}</p>
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('resumo_dashboard')
      if (error) throw error
      return data as unknown as Resumo
    },
  })

  const reposicao = data?.reposicao ?? []
  const movimentacoes = data?.ultimas_movimentacoes ?? []

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão geral do ThermoTech ERP" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica
          titulo="OS em aberto"
          icone={Wrench}
          valor={data?.os_abertas}
          legenda="orçamento, em andamento ou aguardando peça"
          carregando={isLoading}
        />

        {data?.ver_valor_estoque && (
          <Metrica
            titulo="Valor em estoque"
            icone={Warehouse}
            valor={formatCurrency(data.valor_estoque)}
            legenda="saldo × custo médio"
            carregando={isLoading}
          />
        )}

        {data?.ver_financeiro && (
          <>
            <Metrica
              titulo="A receber"
              icone={ReceiptText}
              valor={formatCurrency(data.total_receber)}
              legenda="saldo em aberto, vencido ou a vencer"
              carregando={isLoading}
            />
            <Metrica
              titulo="A pagar"
              icone={AlertTriangle}
              valor={formatCurrency(data.total_pagar)}
              legenda="saldo em aberto, vencido ou a vencer"
              carregando={isLoading}
            />
          </>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Estoque</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{data?.total_produtos ?? 0}</strong> produtos ativos
            </span>
            <span className={data?.produtos_abaixo_minimo ? 'text-amber-600' : ''}>
              <strong>{data?.produtos_abaixo_minimo ?? 0}</strong> abaixo do mínimo
            </span>
            <span className={data?.produtos_sem_saldo ? 'text-destructive' : ''}>
              <strong>{data?.produtos_sem_saldo ?? 0}</strong> sem saldo
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Precisa de reposição</CardTitle>
              <Link
                to="/estoque/produtos"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                ver produtos
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading && <Skeleton className="h-24 w-full" />}

              {!isLoading && reposicao.length === 0 && (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <PackageCheck className="size-4 text-emerald-600" />
                  Nenhum produto abaixo do mínimo — estoque em dia.
                </div>
              )}

              {!isLoading && reposicao.length > 0 && (
                <ul className="divide-y">
                  {reposicao.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <Link
                        to={`/estoque/produtos?q=${encodeURIComponent(item.nome)}`}
                        className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                      >
                        {item.nome}
                      </Link>

                      {item.comprometido > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.comprometido} em OS aberta
                        </Badge>
                      )}

                      <span className="text-muted-foreground">
                        {item.disponivel} de {item.minimo} {item.unidade}
                      </span>

                      <Badge variant={item.disponivel <= 0 ? 'destructive' : 'secondary'}>
                        {item.disponivel <= 0 ? 'sem saldo' : `faltam ${item.falta}`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Últimas movimentações</CardTitle>
              <Link
                to="/estoque/movimentacoes"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                ver todas
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading && <Skeleton className="h-24 w-full" />}

              {!isLoading && movimentacoes.length === 0 && (
                <p className="py-6 text-sm text-muted-foreground">
                  Nenhuma movimentação ainda. O estoque nasce das entradas de NF-e.
                </p>
              )}

              {!isLoading && movimentacoes.length > 0 && (
                <ul className="divide-y">
                  {movimentacoes.map((mov, i) => {
                    const entrada = mov.tipo === 'entrada' || (mov.tipo === 'ajuste' && mov.quantidade >= 0)
                    return (
                      <li key={`${mov.quando}-${i}`} className="flex items-center gap-2 py-2 text-sm">
                        {entrada ? (
                          <ArrowDownLeft className="size-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <ArrowUpRight className="size-3.5 shrink-0 text-amber-600" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{mov.produto}</span>
                        <span
                          className={`shrink-0 font-medium ${entrada ? 'text-emerald-600' : 'text-amber-600'}`}
                        >
                          {entrada ? '+' : '−'}
                          {Math.abs(mov.quantidade)}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {rotuloOrigem(mov.origem)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}

              {!isLoading && movimentacoes.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Mais recente: {formatDateTime(movimentacoes[0].quando)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
