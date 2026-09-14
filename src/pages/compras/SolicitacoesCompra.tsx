import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Ban } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirmacao } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { mensagemErro } from '@/lib/erros'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/database'

type Solicitacao = {
  id: string
  numero: number
  status: Enums<'solicitacao_compra_status'>
  origem_descricao: string | null
  observacao: string | null
  created_at: string
  autor: { nome: string } | null
  itens: {
    id: string
    quantidade: number
    observacao: string | null
    produto: { nome: string; sku: string | null; unidade: { sigla: string } | null } | null
  }[]
}

const badgeStatus: Record<Enums<'solicitacao_compra_status'>, 'default' | 'secondary' | 'outline'> = {
  aberta: 'default',
  aprovada: 'secondary',
  reprovada: 'outline',
  atendida: 'secondary',
  cancelada: 'outline',
}

/**
 * Solicitações de compra.
 *
 * Hoje elas nascem da explosão de kit, que era um diagnóstico sem saída: o
 * sistema dizia o que faltava e não havia o que fazer com a informação.
 * Cotação, aprovação por alçada e pedido são as etapas seguintes do módulo.
 */
export function SolicitacoesCompra() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const podeSolicitar = hasPermission('compras.solicitar')
  const { pedirConfirmacao, dialogoConfirmacao } = useConfirmacao()
  const [aberta, setAberta] = useState<string | null>(null)

  const { data: solicitacoes, isLoading } = useQuery({
    queryKey: ['solicitacoes-compra'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitacoes_compra')
        .select(
          'id, numero, status, origem_descricao, observacao, created_at, autor:profiles(nome), itens:solicitacoes_compra_itens(id, quantidade, observacao, produto:produtos(nome, sku, unidade:unidades_medida(sigla)))',
        )
        .order('numero', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as Solicitacao[]
    },
  })

  const cancelarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancelar_solicitacao_compra', { p_solicitacao_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Solicitação cancelada.')
      queryClient.invalidateQueries({ queryKey: ['solicitacoes-compra'] })
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  return (
    <div>
      {dialogoConfirmacao}
      <PageHeader
        title="Solicitações de compra"
        description="O que precisa ser comprado. Abertas a partir da necessidade de materiais, com a falta recalculada no momento em que a solicitação foi gerada."
      />

      {isLoading && <Skeleton className="h-32 w-full" />}

      {!isLoading && solicitacoes?.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma solicitação ainda. Elas nascem em{' '}
            <strong>Estoque → Necessidade de materiais</strong>, no botão “Gerar solicitação de
            compra”.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {solicitacoes?.map((s) => {
          const expandida = aberta === s.id
          return (
            <Card key={s.id}>
              <CardContent className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={expandida ? 'Recolher itens' : 'Ver itens'}
                    aria-expanded={expandida}
                    onClick={() => setAberta(expandida ? null : s.id)}
                  >
                    {expandida ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </Button>

                  <span className="font-medium tabular-nums">#{s.numero}</span>
                  <Badge variant={badgeStatus[s.status]}>{s.status}</Badge>

                  <span className="min-w-40 flex-1 truncate text-sm text-muted-foreground">
                    {s.origem_descricao ?? 'Solicitação manual'}
                  </span>

                  <span className="text-xs text-muted-foreground">
                    {s.itens.length} item(ns) · {formatDateTime(s.created_at)}
                    {s.autor?.nome && ` · ${s.autor.nome}`}
                  </span>

                  {podeSolicitar && s.status === 'aberta' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        pedirConfirmacao({
                          titulo: `Cancelar solicitação #${s.numero}`,
                          destrutivo: true,
                          rotuloConfirmar: 'Cancelar solicitação',
                          rotuloDispensar: 'Voltar',
                          descricao: <>Ela sai da fila de compras. O histórico continua aqui.</>,
                          aoConfirmar: () => cancelarMutation.mutateAsync(s.id),
                        })
                      }
                    >
                      <Ban className="size-4" />
                      Cancelar
                    </Button>
                  )}
                </div>

                {expandida && (
                  <ul className="mt-2 divide-y border-t pt-1">
                    {s.itens.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-sm">
                        <span className="min-w-40 flex-1 truncate">
                          {i.produto?.nome ?? 'Produto removido'}
                          {i.produto?.sku && (
                            <span className="ml-1.5 text-xs text-muted-foreground">{i.produto.sku}</span>
                          )}
                        </span>
                        <span className="font-medium tabular-nums">
                          {Number(i.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}{' '}
                          {i.produto?.unidade?.sigla ?? ''}
                        </span>
                        {i.observacao && (
                          <span className="w-full text-xs text-muted-foreground">{i.observacao}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {expandida && s.observacao && (
                  <p className="mt-2 border-t pt-2 text-xs whitespace-pre-line text-muted-foreground">
                    {s.observacao}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
