import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Ban, CheckCircle2, Factory, Play, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirmacao } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Combobox } from '@/components/campos/Combobox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import { buscarKitsDeProducao, buscarTecnicos, carregarTecnico } from '@/lib/buscas'
import { mensagemErro } from '@/lib/erros'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/database'

type ItemOrdem = {
  id: string
  produto_id: string
  quantidade_prevista: number
  quantidade_consumida: number
  quantidade_perdida: number
  produto: { nome: string; unidade: { sigla: string } | null } | null
}

type Ordem = {
  id: string
  numero: number
  status: Enums<'ordem_producao_status'>
  quantidade_planejada: number
  quantidade_produzida: number
  quantidade_perdida: number
  custo_total: number
  data_prevista: string | null
  iniciada_em: string | null
  concluida_em: string | null
  observacao: string | null
  created_at: string
  produto: { nome: string; controle: Enums<'controle_rastreio'> } | null
  ficha: { versao: number } | null
  responsavel: { nome: string } | null
  itens: ItemOrdem[]
}

const rotuloStatus: Record<Enums<'ordem_producao_status'>, string> = {
  planejada: 'planejada',
  em_producao: 'em produção',
  concluida: 'concluída',
  cancelada: 'cancelada',
}

function numero(v: number) {
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

/**
 * Ordens de produção.
 *
 * A montagem era invisível: o kit saía e os componentes baixavam em cascata
 * dentro de um gatilho, sem ordem, responsável, consumo real nem perda — e o
 * produto acabado nunca entrava no estoque. Aqui a ordem congela a versão da
 * ficha na abertura, reserva os componentes enquanto está aberta, e a conclusão
 * baixa o consumo real, registra a perda e dá entrada no acabado numa transação
 * só.
 */
export function OrdensProducao() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const podeGerenciar = hasPermission('producao.gerenciar')
  const { pedirConfirmacao, dialogoConfirmacao } = useConfirmacao()

  const [abrindo, setAbrindo] = useState(false)
  const [concluindo, setConcluindo] = useState<Ordem | null>(null)
  const [expandida, setExpandida] = useState<string | null>(null)

  // Formulário de abertura
  const [kitId, setKitId] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [dataPrevista, setDataPrevista] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [observacao, setObservacao] = useState('')

  // Formulário de conclusão
  const [produzida, setProduzida] = useState('')
  const [perdida, setPerdida] = useState('0')
  const [consumos, setConsumos] = useState<Record<string, { consumido: string; perdido: string }>>({})
  const [series, setSeries] = useState('')
  const [loteCodigo, setLoteCodigo] = useState('')

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['ordens-producao'] })
    queryClient.invalidateQueries({ queryKey: ['produtos'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const { data: ordens, isLoading } = useQuery({
    queryKey: ['ordens-producao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_producao')
        .select(
          'id, numero, status, quantidade_planejada, quantidade_produzida, quantidade_perdida, custo_total, data_prevista, iniciada_em, concluida_em, observacao, created_at, produto:produtos(nome, controle), ficha:fichas_tecnicas(versao), responsavel:profiles(nome), itens:ordens_producao_itens(id, produto_id, quantidade_prevista, quantidade_consumida, quantidade_perdida, produto:produtos(nome, unidade:unidades_medida(sigla)))',
        )
        .order('numero', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as Ordem[]
    },
  })

  // Prévia do que a ordem vai consumir, antes de abrir.
  const { data: previa } = useQuery({
    queryKey: ['previa-op', kitId, quantidade],
    enabled: abrindo && !!kitId && Number(quantidade) > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('necessidade_de_materiais', {
        p_produto_id: kitId,
        p_quantidade: Number(quantidade),
      })
      if (error) throw error
      return data as unknown as {
        componentes: { id: string; nome: string; necessario: number; disponivel: number; faltante: number; unidade: string }[]
        itens_faltando: number
        custo_total: number
      }
    },
  })

  const abrirMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('abrir_ordem_producao', {
        p_produto_id: kitId,
        p_quantidade: Number(quantidade),
        p_data_prevista: dataPrevista || undefined,
        p_responsavel_id: responsavelId || undefined,
        p_observacao: observacao || undefined,
      })
      if (error) throw error
      return data as unknown as { numero: number; itens_faltando: number }
    },
    onSuccess: (r) => {
      toast.success(
        r.itens_faltando > 0
          ? `Ordem #${r.numero} aberta — atenção: ${r.itens_faltando} componente(s) sem saldo suficiente.`
          : `Ordem #${r.numero} aberta.`,
      )
      setAbrindo(false)
      setKitId('')
      setQuantidade('1')
      setDataPrevista('')
      setResponsavelId('')
      setObservacao('')
      invalidar()
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  const iniciarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('iniciar_ordem_producao', { p_ordem_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Ordem em produção.')
      invalidar()
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  const cancelarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancelar_ordem_producao', { p_ordem_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Ordem cancelada. Os componentes saíram da reserva.')
      invalidar()
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  const concluirMutation = useMutation({
    mutationFn: async () => {
      if (!concluindo) throw new Error('Nenhuma ordem selecionada.')

      const lista = concluindo.itens.map((i) => ({
        produto_id: i.produto_id,
        consumido: Number(consumos[i.produto_id]?.consumido ?? i.quantidade_prevista),
        perdido: Number(consumos[i.produto_id]?.perdido ?? 0),
      }))

      const { data, error } = await supabase.rpc('concluir_ordem_producao', {
        p_ordem_id: concluindo.id,
        p_quantidade_produzida: Number(produzida),
        p_quantidade_perdida: Number(perdida || 0),
        p_consumos: lista,
        p_lote_codigo: loteCodigo || undefined,
        p_series: series.trim()
          ? series
              .split(/[\n,;]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      })
      if (error) throw error
      return data as unknown as { numero: number; produzida: number; custo_unitario: number }
    },
    onSuccess: (r) => {
      toast.success(
        `Ordem #${r.numero} concluída: ${numero(r.produzida)} no estoque a ${formatCurrency(r.custo_unitario)} cada.`,
      )
      setConcluindo(null)
      invalidar()
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  function abrirConclusao(ordem: Ordem) {
    setConcluindo(ordem)
    setProduzida(String(ordem.quantidade_planejada))
    setPerdida('0')
    setSeries('')
    setLoteCodigo('')
    setConsumos(
      Object.fromEntries(
        ordem.itens.map((i) => [
          i.produto_id,
          { consumido: String(i.quantidade_prevista), perdido: '0' },
        ]),
      ),
    )
  }

  return (
    <div>
      {dialogoConfirmacao}
      <PageHeader
        title="Ordens de produção"
        description="O que está sendo montado, com o que foi realmente consumido. Enquanto a ordem está aberta, os componentes ficam reservados."
        actions={
          podeGerenciar && (
            <Button onClick={() => setAbrindo(true)}>
              <Plus className="size-4" />
              Nova ordem
            </Button>
          )
        }
      />

      {isLoading && <Skeleton className="h-32 w-full" />}

      {!isLoading && ordens?.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma ordem ainda. Elas valem para kits marcados como{' '}
            <strong>montado por ordem de produção</strong> no cadastro — o kit que explode no
            consumo não passa por aqui.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {ordens?.map((o) => {
          const aberta = expandida === o.id
          return (
            <Card key={o.id}>
              <CardContent className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="button"
                    onClick={() => setExpandida(aberta ? null : o.id)}
                    aria-expanded={aberta}
                    className="font-medium tabular-nums underline-offset-4 hover:underline"
                  >
                    #{o.numero}
                  </button>
                  <Badge
                    variant={
                      o.status === 'concluida'
                        ? 'secondary'
                        : o.status === 'em_producao'
                          ? 'default'
                          : 'outline'
                    }
                  >
                    {rotuloStatus[o.status]}
                  </Badge>

                  <span className="min-w-40 flex-1 truncate text-sm">
                    {numero(o.quantidade_planejada)} × {o.produto?.nome ?? '—'}
                    {o.ficha && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ficha v{o.ficha.versao}
                      </span>
                    )}
                  </span>

                  {o.status === 'concluida' && (
                    <span className="text-xs text-muted-foreground">
                      {numero(o.quantidade_produzida)} produzidas
                      {o.quantidade_perdida > 0 && ` · ${numero(o.quantidade_perdida)} refugadas`}
                      {' · '}
                      {formatCurrency(o.custo_total)}
                    </span>
                  )}

                  {o.data_prevista && o.status !== 'concluida' && (
                    <span className="text-xs text-muted-foreground">
                      prevista {formatDate(o.data_prevista)}
                    </span>
                  )}

                  {o.responsavel?.nome && (
                    <span className="text-xs text-muted-foreground">{o.responsavel.nome}</span>
                  )}

                  {podeGerenciar && o.status === 'planejada' && (
                    <Button size="sm" variant="outline" onClick={() => iniciarMutation.mutate(o.id)}>
                      <Play className="size-4" />
                      Iniciar
                    </Button>
                  )}
                  {podeGerenciar && o.status === 'em_producao' && (
                    <Button size="sm" onClick={() => abrirConclusao(o)}>
                      <CheckCircle2 className="size-4" />
                      Concluir
                    </Button>
                  )}
                  {podeGerenciar && o.status !== 'concluida' && o.status !== 'cancelada' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        pedirConfirmacao({
                          titulo: `Cancelar ordem #${o.numero}`,
                          destrutivo: true,
                          rotuloConfirmar: 'Cancelar ordem',
                          rotuloDispensar: 'Voltar',
                          descricao: (
                            <>Os componentes saem da reserva. Nada foi consumido ainda.</>
                          ),
                          aoConfirmar: () => cancelarMutation.mutateAsync(o.id),
                        })
                      }
                    >
                      <Ban className="size-4" />
                    </Button>
                  )}
                </div>

                {aberta && (
                  <div className="mt-2 border-t pt-2">
                    <ul className="divide-y text-sm">
                      {o.itens.map((i) => (
                        <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                          <span className="min-w-40 flex-1 truncate">{i.produto?.nome ?? '—'}</span>
                          <span className="text-muted-foreground">
                            previsto {numero(i.quantidade_prevista)}{' '}
                            {i.produto?.unidade?.sigla ?? ''}
                          </span>
                          {o.status === 'concluida' && (
                            <span className="tabular-nums">
                              consumido <strong>{numero(i.quantidade_consumida)}</strong>
                              {i.quantidade_perdida > 0 && (
                                <span className="text-amber-600">
                                  {' '}
                                  · perda {numero(i.quantidade_perdida)}
                                </span>
                              )}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Aberta em {formatDateTime(o.created_at)}
                      {o.iniciada_em && ` · iniciada em ${formatDateTime(o.iniciada_em)}`}
                      {o.concluida_em && ` · concluída em ${formatDateTime(o.concluida_em)}`}
                    </p>
                    {o.observacao && (
                      <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">
                        {o.observacao}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ------------------------------------------------ abrir ordem */}
      <Dialog open={abrindo} onOpenChange={setAbrindo}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="size-4" />
              Nova ordem de produção
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kit">O que montar</Label>
              <Combobox
                id="kit"
                queryKey="kits-producao"
                valor={kitId}
                aoSelecionar={(v) => setKitId(v)}
                buscar={buscarKitsDeProducao}
                placeholder="Escolha o produto..."
                vazio="Nenhum kit marcado como montado por ordem de produção."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="qtd">Quantidade</Label>
                <Input
                  id="qtd"
                  type="number"
                  min={1}
                  step="1"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="text-right"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prevista">Previsão</Label>
                <Input
                  id="prevista"
                  type="date"
                  value={dataPrevista}
                  onChange={(e) => setDataPrevista(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resp">Responsável</Label>
              <Combobox
                id="resp"
                queryKey="tecnicos-op"
                valor={responsavelId}
                aoSelecionar={(v) => setResponsavelId(v)}
                buscar={buscarTecnicos}
                carregarSelecionado={carregarTecnico}
                placeholder="Quem monta (padrão: você)"
              />
            </div>

            {previa && (
              <div className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium">Vai consumir</span>
                  {previa.itens_faltando > 0 ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="size-3" />
                      {previa.itens_faltando} sem saldo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">saldo cobre</Badge>
                  )}
                  <span className="ml-auto text-muted-foreground">
                    {formatCurrency(previa.custo_total)}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {previa.componentes.map((c) => (
                    <li key={c.id} className="flex flex-wrap gap-x-2 text-xs">
                      <span className="min-w-32 flex-1 truncate">{c.nome}</span>
                      <span className="tabular-nums">
                        {numero(c.necessario)} {c.unidade}
                      </span>
                      <span
                        className={
                          c.faltante > 0 ? 'text-destructive' : 'text-muted-foreground'
                        }
                      >
                        {c.faltante > 0
                          ? `faltam ${numero(c.faltante)}`
                          : `disponível ${numero(c.disponivel)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                {previa.itens_faltando > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Dá para abrir mesmo assim — a ordem reserva o que existe e você resolve a
                    compra antes de concluir.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="obs">Observação</Label>
              <Textarea
                id="obs"
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => abrirMutation.mutate()}
              disabled={!kitId || abrirMutation.isPending}
            >
              {abrirMutation.isPending ? 'Abrindo...' : 'Abrir ordem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------ concluir */}
      <Dialog open={!!concluindo} onOpenChange={(v) => !v && setConcluindo(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Concluir ordem #{concluindo?.numero}</DialogTitle>
          </DialogHeader>

          {concluindo && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                O consumo já vem preenchido com o previsto. Ajuste só o que saiu diferente — é
                isso que vira o custo real do produto.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="produzida">Unidades boas</Label>
                  <Input
                    id="produzida"
                    type="number"
                    min={0}
                    step="1"
                    value={produzida}
                    onChange={(e) => setProduzida(e.target.value)}
                    className="text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="refugadas">Refugadas</Label>
                  <Input
                    id="refugadas"
                    type="number"
                    min={0}
                    step="1"
                    value={perdida}
                    onChange={(e) => setPerdida(e.target.value)}
                    className="text-right"
                  />
                  <p className="text-xs text-muted-foreground">Não entram no estoque.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Consumo real</Label>
                {concluindo.itens.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-full min-w-0 truncate text-sm">
                      {i.produto?.nome ?? '—'}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        previsto {numero(i.quantidade_prevista)} {i.produto?.unidade?.sigla ?? ''}
                      </span>
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      aria-label={`Consumido de ${i.produto?.nome ?? ''}`}
                      className="h-8 w-24 text-right"
                      value={consumos[i.produto_id]?.consumido ?? ''}
                      onChange={(e) =>
                        setConsumos((c) => ({
                          ...c,
                          [i.produto_id]: { ...c[i.produto_id], consumido: e.target.value },
                        }))
                      }
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      aria-label={`Perda de ${i.produto?.nome ?? ''}`}
                      title="Perda"
                      className="h-8 w-20 text-right"
                      value={consumos[i.produto_id]?.perdido ?? '0'}
                      onChange={(e) =>
                        setConsumos((c) => ({
                          ...c,
                          [i.produto_id]: { ...c[i.produto_id], perdido: e.target.value },
                        }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">perda</span>
                  </div>
                ))}
              </div>

              {concluindo.produto?.controle === 'lote' && (
                <div className="space-y-2">
                  <Label htmlFor="lote">Lote do produto acabado</Label>
                  <Input
                    id="lote"
                    value={loteCodigo}
                    onChange={(e) => setLoteCodigo(e.target.value)}
                    placeholder={`OP ${concluindo.numero}`}
                  />
                </div>
              )}

              {concluindo.produto?.controle === 'serie' && (
                <div className="space-y-2">
                  <Label htmlFor="series">Números de série</Label>
                  <Textarea
                    id="series"
                    rows={3}
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    placeholder="Um por linha (ou separados por vírgula)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Precisa de exatamente um número por unidade boa.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => concluirMutation.mutate()} disabled={concluirMutation.isPending}>
              {concluirMutation.isPending ? 'Concluindo...' : 'Concluir e dar entrada'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
