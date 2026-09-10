import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Boxes, ReceiptText, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/format'

async function loadDashboardData() {
  const [produtos, osAbertas, contasReceberAbertas, contasPagarAbertas] = await Promise.all([
    supabase.from('produtos').select('estoque_atual, estoque_minimo, ativo').eq('ativo', true),
    supabase
      .from('ordens_servico')
      .select('id', { count: 'exact', head: true })
      .in('status', ['aberta', 'em_andamento', 'aguardando_peca']),
    supabase
      .from('contas_receber')
      .select('valor')
      .in('status', ['pendente', 'atrasado']),
    supabase
      .from('contas_pagar')
      .select('valor')
      .in('status', ['pendente', 'atrasado']),
  ])

  const produtosAbaixoMinimo =
    produtos.data?.filter((p) => p.estoque_atual < p.estoque_minimo).length ?? 0

  const totalReceber = contasReceberAbertas.data?.reduce((acc, c) => acc + Number(c.valor), 0) ?? 0
  const totalPagar = contasPagarAbertas.data?.reduce((acc, c) => acc + Number(c.valor), 0) ?? 0

  return {
    totalProdutos: produtos.data?.length ?? 0,
    produtosAbaixoMinimo,
    osAbertas: osAbertas.count ?? 0,
    totalReceber,
    totalPagar,
  }
}

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: loadDashboardData,
  })

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão geral do ThermoTech ERP" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Produtos ativos
            </CardTitle>
            <Boxes className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : data?.totalProdutos}</div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? '' : `${data?.produtosAbaixoMinimo ?? 0} abaixo do estoque mínimo`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">OS em aberto</CardTitle>
            <Wrench className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : data?.osAbertas}</div>
            <p className="text-xs text-muted-foreground">aberta, em andamento ou aguardando peça</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">A receber</CardTitle>
            <ReceiptText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '—' : formatCurrency(data?.totalReceber)}
            </div>
            <p className="text-xs text-muted-foreground">pendente ou atrasado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">A pagar</CardTitle>
            <AlertTriangle className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '—' : formatCurrency(data?.totalPagar)}
            </div>
            <p className="text-xs text-muted-foreground">pendente ou atrasado</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
