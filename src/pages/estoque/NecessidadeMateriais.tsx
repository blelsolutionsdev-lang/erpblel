import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, PackageCheck, ShoppingCart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Combobox } from '@/components/campos/Combobox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFiltrosUrl } from '@/hooks/use-filtros-url'
import { useAuth } from '@/lib/auth'
import { buscarKits, carregarProduto } from '@/lib/buscas'
import { mensagemErro } from '@/lib/erros'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Componente = {
  id: string
  nome: string
  sku: string | null
  unidade: string
  nivel: number
  necessario: number
  estoque: number
  comprometido: number
  disponivel: number
  faltante: number
  custo_unitario: number
  custo_total: number
}

type Necessidade = {
  produto_nome: string
  quantidade: number
  ficha_versao: number
  custo_unitario_ficha: number
  componentes: Componente[]
  itens_faltando: number
  custo_total: number
}

/** Tira o zero à direita: 10.0000 vira 10, 3.1500 vira 3,15. */
function numero(valor: number) {
  return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

/**
 * "Produzir 10 unidades do Kit Aquecedor X" — o que é preciso, o que existe, o
 * que já está prometido para outra OS e o que falta comprar.
 *
 * A conta roda no banco (`necessidade_de_materiais`), desce pela ficha em vigor
 * e agrega nos componentes reais: submontado é etapa de montagem, não linha de
 * compra.
 */
export function NecessidadeMateriais() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const podeSolicitar = hasPermission('compras.solicitar')
  const { filtros, definir } = useFiltrosUrl({ kit: '', qtd: '1' })
  const quantidade = Number(filtros.qtd)
  const quantidadeValida = Number.isFinite(quantidade) && quantidade > 0

  const { data, isLoading, error } = useQuery({
    queryKey: ['necessidade-materiais', filtros.kit, filtros.qtd],
    enabled: !!filtros.kit && quantidadeValida,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('necessidade_de_materiais', {
        p_produto_id: filtros.kit,
        p_quantidade: quantidade,
      })
      if (error) throw error
      return data as unknown as Necessidade
    },
  })

  // A RPC refaz a conta no servidor: entre ver a tela e clicar, uma OS pode
  // ter reservado o saldo.
  const solicitarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('gerar_solicitacao_de_faltantes', {
        p_produto_id: filtros.kit,
        p_quantidade: quantidade,
      })
      if (error) throw error
      return data as unknown as { numero: number; itens: number }
    },
    onSuccess: (r) => {
      toast.success(`Solicitação #${r.numero} aberta com ${r.itens} item(ns).`, {
        action: { label: 'Ver', onClick: () => navigate('/compras/solicitacoes') },
      })
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  const faltando = data?.componentes.filter((c) => c.faltante > 0) ?? []

  return (
    <div>
      <PageHeader
        title="Necessidade de materiais"
        description="Quanto de cada componente uma produção consome, contra o que está disponível de verdade — já descontando o que outras OS abertas reservaram."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="kit">Kit a produzir</Label>
            <Combobox
              id="kit"
              queryKey="kits"
              valor={filtros.kit}
              aoSelecionar={(v) => definir({ kit: v })}
              buscar={buscarKits}
              carregarSelecionado={carregarProduto}
              placeholder="Escolha o kit..."
              vazio="Nenhum kit cadastrado."
            />
          </div>
          <div className="w-28 space-y-1.5">
            <Label htmlFor="qtd">Quantidade</Label>
            <Input
              id="qtd"
              type="number"
              min={1}
              step="1"
              value={filtros.qtd}
              onChange={(e) => definir({ qtd: e.target.value })}
              className="text-right"
            />
          </div>
        </CardContent>
      </Card>

      {!filtros.kit && (
        <p className="text-sm text-muted-foreground">Escolha um kit para ver a necessidade.</p>
      )}

      {error && (
        <Card className="mb-4 border-destructive">
          <CardContent className="flex items-start gap-2 py-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{(error as Error).message}</span>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card className="mb-4">
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
              <span>
                <strong>{numero(data.quantidade)}</strong> × {data.produto_nome}
              </span>
              <span className="text-muted-foreground">
                ficha v{data.ficha_versao} · custo unitário{' '}
                {formatCurrency(data.custo_unitario_ficha)}
              </span>
              <span className="text-muted-foreground">
                custo dos componentes <strong>{formatCurrency(data.custo_total)}</strong>
              </span>

              {data.itens_faltando > 0 ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3" />
                  {data.itens_faltando} item(ns) em falta
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <PackageCheck className="size-3" />
                  dá para produzir
                </Badge>
              )}
            </CardContent>
          </Card>

          {faltando.length > 0 && (
            <Card className="mb-4">
              <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-56 flex-1">
                  <p className="mb-1 font-medium">Falta comprar</p>
                  <p className="text-muted-foreground">
                    {faltando
                      .map((c) => `${numero(c.faltante)} ${c.unidade} de ${c.nome}`)
                      .join(' · ')}
                  </p>
                </div>
                {podeSolicitar && (
                  <Button
                    onClick={() => solicitarMutation.mutate()}
                    disabled={solicitarMutation.isPending}
                  >
                    <ShoppingCart className="size-4" />
                    {solicitarMutation.isPending ? 'Abrindo...' : 'Gerar solicitação de compra'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <DataTable
            linhas={data.componentes}
            carregando={isLoading}
            chave={(c) => c.id}
            vazio="A ficha em vigor não tem componentes."
            colunas={[
              {
                titulo: 'Componente',
                mobile: 'titulo',
                celula: (c) => (
                  <div>
                    <div className="font-medium">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.sku ?? 'sem SKU'}
                      {c.nivel > 1 && ` · via submontado (nível ${c.nivel})`}
                    </div>
                  </div>
                ),
              },
              {
                titulo: 'Necessário',
                alinhar: 'direita',
                mobile: 'destaque',
                celula: (c) => (
                  <span className="tabular-nums">
                    {numero(c.necessario)} {c.unidade}
                  </span>
                ),
              },
              {
                titulo: 'Em estoque',
                alinhar: 'direita',
                celula: (c) => <span className="tabular-nums">{numero(c.estoque)}</span>,
              },
              {
                titulo: 'Reservado',
                alinhar: 'direita',
                celula: (c) => (
                  <span className="tabular-nums text-muted-foreground">
                    {c.comprometido > 0 ? numero(c.comprometido) : '—'}
                  </span>
                ),
              },
              {
                titulo: 'Disponível',
                alinhar: 'direita',
                celula: (c) => (
                  <span className={`tabular-nums ${c.disponivel <= 0 ? 'text-destructive' : ''}`}>
                    {numero(c.disponivel)}
                  </span>
                ),
              },
              {
                titulo: 'Falta',
                alinhar: 'direita',
                mobile: 'destaque',
                celula: (c) =>
                  c.faltante > 0 ? (
                    <Badge variant="destructive" className="tabular-nums">
                      {numero(c.faltante)} {c.unidade}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
            ]}
          />
        </>
      )}
    </div>
  )
}
