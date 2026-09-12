import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Boxes, ReceiptText, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/format'

type Resumo = {
  total_produtos: number
  produtos_abaixo_minimo: number
  os_abertas: number
  ver_financeiro: boolean
  total_receber: number | null
  total_pagar: number | null
}

function Metrica({
  titulo,
  icone: Icone,
  valor,
  legenda,
  carregando,
}: {
  titulo: string
  icone: typeof Boxes
  valor: string | number | undefined
  legenda: string
  carregando: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <Icone className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {carregando ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold">{valor}</div>
        )}
        <p className="text-xs text-muted-foreground">{carregando ? '' : legenda}</p>
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  // Um RPC só, resolvido no banco: antes o dashboard baixava a tabela inteira
  // de produtos e todos os títulos em aberto só para somar no navegador. O
  // financeiro só volta preenchido para quem tem 'financeiro.gerenciar'.
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('resumo_dashboard')
      if (error) throw error
      return data as unknown as Resumo
    },
  })

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão geral do ThermoTech ERP" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica
          titulo="Produtos ativos"
          icone={Boxes}
          valor={data?.total_produtos}
          legenda={`${data?.produtos_abaixo_minimo ?? 0} abaixo do estoque mínimo`}
          carregando={isLoading}
        />

        <Metrica
          titulo="OS em aberto"
          icone={Wrench}
          valor={data?.os_abertas}
          legenda="aberta, em andamento ou aguardando peça"
          carregando={isLoading}
        />

        {data?.ver_financeiro && (
          <>
            <Metrica
              titulo="A receber"
              icone={ReceiptText}
              valor={formatCurrency(data.total_receber)}
              legenda="pendente ou atrasado"
              carregando={isLoading}
            />
            <Metrica
              titulo="A pagar"
              icone={AlertTriangle}
              valor={formatCurrency(data.total_pagar)}
              legenda="pendente ou atrasado"
              carregando={isLoading}
            />
          </>
        )}
      </div>
    </div>
  )
}
