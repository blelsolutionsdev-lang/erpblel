import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, GitBranch, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirmacao } from '@/components/ConfirmDialog'
import { Combobox } from '@/components/campos/Combobox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buscarComponentes } from '@/lib/buscas'
import { custoFicha, custoLinhaFicha } from '@/lib/ficha'
import { mensagemErro } from '@/lib/erros'
import { formatCurrency, formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/database'

type Ficha = {
  id: string
  versao: number
  status: Enums<'ficha_status'>
  vigencia_inicio: string
  vigencia_fim: string | null
  observacao: string | null
  custo_calculado: number
}

type ItemFicha = {
  id: string
  componente_produto_id: string
  quantidade: number
  perda_percentual: number
  componente: {
    nome: string
    tipo: Enums<'produto_tipo'>
    preco_custo: number
    unidade: { sigla: string } | null
  }
}

const rotuloStatus: Record<Enums<'ficha_status'>, string> = {
  rascunho: 'rascunho',
  ativa: 'em vigor',
  encerrada: 'encerrada',
}

/**
 * Ficha técnica (BOM) versionada de um kit.
 *
 * A composição antiga era editada no lugar, sem versão nem histórico — e como
 * a baixa em cascata lê a ficha no momento do movimento, depois de qualquer
 * alteração ninguém sabia com o que um kit tinha sido montado. Aqui a versão
 * em vigor é somente leitura: para mudar, abre-se um rascunho (que nasce como
 * cópia) e ele só entra em vigor quando ativado.
 */
export function FichaTecnica({
  produtoId,
  editavel = true,
}: {
  produtoId: string
  editavel?: boolean
}) {
  const queryClient = useQueryClient()
  const { pedirConfirmacao, dialogoConfirmacao } = useConfirmacao()
  const [versaoVista, setVersaoVista] = useState<string>('')
  const [novoComponente, setNovoComponente] = useState('')
  const [novaQuantidade, setNovaQuantidade] = useState('1')

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['fichas', produtoId] })
    queryClient.invalidateQueries({ queryKey: ['ficha-itens'] })
    queryClient.invalidateQueries({ queryKey: ['produtos'] })
  }

  const { data: fichas, isLoading } = useQuery({
    queryKey: ['fichas', produtoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fichas_tecnicas')
        .select('id, versao, status, vigencia_inicio, vigencia_fim, observacao, custo_calculado')
        .eq('produto_id', produtoId)
        .order('versao', { ascending: false })
      if (error) throw error
      return data as Ficha[]
    },
  })

  const rascunho = fichas?.find((f) => f.status === 'rascunho')
  const ativa = fichas?.find((f) => f.status === 'ativa')
  // O rascunho aberto é o que a pessoa quer ver; senão, a que está em vigor.
  const ficha = fichas?.find((f) => f.id === versaoVista) ?? rascunho ?? ativa ?? fichas?.[0]
  const editando = editavel && ficha?.status === 'rascunho'

  const { data: itens } = useQuery({
    queryKey: ['ficha-itens', ficha?.id],
    enabled: !!ficha,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fichas_tecnicas_itens')
        .select(
          'id, componente_produto_id, quantidade, perda_percentual, componente:produtos!fichas_tecnicas_itens_componente_produto_id_fkey(nome, tipo, preco_custo, unidade:unidades_medida(sigla))',
        )
        .eq('ficha_id', ficha!.id)
      if (error) throw error
      return (data as unknown as ItemFicha[]).sort((a, b) =>
        a.componente.nome.localeCompare(b.componente.nome, 'pt-BR'),
      )
    },
  })

  // Submontado entra pelo custo da própria ficha em vigor — mesma conta que o
  // banco faz na ativação.
  const idsKit = (itens ?? []).filter((i) => i.componente.tipo === 'kit').map((i) => i.componente_produto_id)
  const { data: custoSubmontados } = useQuery({
    queryKey: ['ficha-custo-submontados', idsKit.join(',')],
    enabled: idsKit.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fichas_tecnicas')
        .select('produto_id, custo_calculado')
        .eq('status', 'ativa')
        .in('produto_id', idsKit)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((f) => [f.produto_id, Number(f.custo_calculado)]))
    },
  })

  function custoUnitario(item: ItemFicha) {
    return item.componente.tipo === 'kit'
      ? (custoSubmontados?.[item.componente_produto_id] ?? 0)
      : Number(item.componente.preco_custo)
  }

  function custoLinha(item: ItemFicha) {
    return custoLinhaFicha({ ...item, custo_unitario: custoUnitario(item) })
  }

  const custoEstimado = custoFicha(
    (itens ?? []).map((i) => ({ ...i, custo_unitario: custoUnitario(i) })),
  )

  const novaVersaoMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('criar_versao_ficha', {
        p_produto_id: produtoId,
        p_copiar_da_ativa: true,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => {
      setVersaoVista(id)
      toast.success('Rascunho aberto como cópia da versão em vigor. Edite e ative quando terminar.')
      invalidar()
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  const ativarMutation = useMutation({
    mutationFn: async (fichaId: string) => {
      const { data, error } = await supabase.rpc('ativar_ficha_tecnica', { p_ficha_id: fichaId })
      if (error) throw error
      return data as { versao: number; custo_calculado: number }
    },
    onSuccess: (r) => {
      setVersaoVista('')
      toast.success(`Versão ${r.versao} em vigor. Custo congelado em ${formatCurrency(r.custo_calculado)}.`)
      invalidar()
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  const descartarMutation = useMutation({
    mutationFn: async (fichaId: string) => {
      const { error } = await supabase.from('fichas_tecnicas').delete().eq('id', fichaId)
      if (error) throw error
    },
    onSuccess: () => {
      setVersaoVista('')
      toast.success('Rascunho descartado. A versão em vigor não mudou.')
      invalidar()
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!ficha) throw new Error('Abra um rascunho antes de adicionar componentes.')
      if (!novoComponente) throw new Error('Escolha o componente.')
      const quantidade = Number(novaQuantidade)
      if (!(quantidade > 0)) throw new Error('A quantidade precisa ser maior que zero.')

      const { error } = await supabase.from('fichas_tecnicas_itens').insert({
        ficha_id: ficha.id,
        componente_produto_id: novoComponente,
        quantidade,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setNovoComponente('')
      setNovaQuantidade('1')
      invalidar()
    },
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  const editarItemMutation = useMutation({
    mutationFn: async ({
      id,
      campos,
    }: {
      id: string
      campos: { quantidade?: number; perda_percentual?: number }
    }) => {
      const { error } = await supabase.from('fichas_tecnicas_itens').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidar(),
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  const removerItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fichas_tecnicas_itens').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidar(),
    onError: (e: unknown) => toast.error(mensagemErro(e)),
  })

  if (isLoading) {
    return <p className="rounded-lg border p-3 text-sm text-muted-foreground">Carregando ficha técnica...</p>
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {dialogoConfirmacao}

      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm font-medium">Ficha técnica</p>

        {fichas && fichas.length > 1 && (
          <Select
            items={fichas.map((f) => ({ value: f.id, label: `v${f.versao}` }))}
            value={ficha?.id ?? ''}
            onValueChange={(v) => setVersaoVista(v ?? '')}
          >
            <SelectTrigger className="h-7 w-28" aria-label="Versão da ficha">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fichas.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  v{f.versao} · {rotuloStatus[f.status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {ficha && (
          <Badge
            variant={
              ficha.status === 'ativa' ? 'default' : ficha.status === 'rascunho' ? 'secondary' : 'outline'
            }
          >
            v{ficha.versao} · {rotuloStatus[ficha.status]}
          </Badge>
        )}
      </div>

      {ficha ? (
        <p className="text-xs text-muted-foreground">
          {ficha.status === 'ativa' && (
            <>
              Em vigor desde {formatDate(ficha.vigencia_inicio)} · custo congelado{' '}
              {formatCurrency(ficha.custo_calculado)}. Para alterar, abra uma nova versão.
            </>
          )}
          {ficha.status === 'encerrada' && (
            <>
              Vigeu de {formatDate(ficha.vigencia_inicio)} a {formatDate(ficha.vigencia_fim)} · custo{' '}
              {formatCurrency(ficha.custo_calculado)}. Somente leitura.
            </>
          )}
          {ficha.status === 'rascunho' && (
            <>
              Rascunho: nada muda no estoque até você ativar. Custo estimado com os preços de hoje:{' '}
              {formatCurrency(custoEstimado)}.
            </>
          )}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Este kit ainda não tem ficha técnica. Sem ela, o estoque não consegue baixar os componentes.
        </p>
      )}

      {itens && itens.length > 0 && (
        <div className="space-y-1.5">
          {itens.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b pb-2 last:border-0 last:pb-0"
            >
              <span className="w-full min-w-0 truncate text-sm">
                {item.componente.nome}
                {item.componente.tipo === 'kit' && (
                  <Badge variant="outline" className="ml-1.5 text-[10px]">
                    submontado
                  </Badge>
                )}
              </span>

              <Input
                type="number"
                min={0.001}
                step="0.001"
                defaultValue={item.quantidade}
                disabled={!editando}
                aria-label={`Quantidade de ${item.componente.nome}`}
                className="h-8 w-20 text-right"
                onBlur={(e) => {
                  const quantidade = Number(e.target.value)
                  if (quantidade > 0 && quantidade !== item.quantidade) {
                    editarItemMutation.mutate({ id: item.id, campos: { quantidade } })
                  }
                }}
              />
              <span className="w-8 text-xs text-muted-foreground">
                {item.componente.unidade?.sigla ?? ''}
              </span>

              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={99}
                  step="0.1"
                  defaultValue={item.perda_percentual}
                  disabled={!editando}
                  aria-label={`Perda prevista de ${item.componente.nome} em %`}
                  title="Perda prevista (%)"
                  className="h-8 w-16 text-right"
                  onBlur={(e) => {
                    const perda_percentual = Number(e.target.value)
                    if (perda_percentual >= 0 && perda_percentual !== item.perda_percentual) {
                      editarItemMutation.mutate({ id: item.id, campos: { perda_percentual } })
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">% perda</span>
              </div>

              <span className="ml-auto w-20 text-right text-xs text-muted-foreground tabular-nums">
                {formatCurrency(custoLinha(item))}
              </span>

              {editando && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${item.componente.nome}`}
                  onClick={() =>
                    pedirConfirmacao({
                      titulo: 'Remover componente',
                      destrutivo: true,
                      rotuloConfirmar: 'Remover',
                      descricao: (
                        <>
                          <strong>{item.componente.nome}</strong> sai desta versão da ficha. A versão em
                          vigor não muda até você ativar o rascunho.
                        </>
                      ),
                      aoConfirmar: () => removerItemMutation.mutateAsync(item.id),
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {itens && itens.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum componente nesta versão.</p>
      )}

      {editando && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Combobox
            className="min-w-48 flex-1"
            queryKey={`componentes-${produtoId}`}
            valor={novoComponente}
            aoSelecionar={(v) => setNovoComponente(v)}
            buscar={buscarComponentes(produtoId)}
            placeholder="Adicionar componente..."
            vazio="Nenhum produto encontrado."
          />
          <Input
            type="number"
            min={0.001}
            step="0.001"
            value={novaQuantidade}
            onChange={(e) => setNovaQuantidade(e.target.value)}
            aria-label="Quantidade do novo componente"
            className="h-9 w-20 text-right"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Adicionar componente"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      )}

      {editavel && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {editando ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={ativarMutation.isPending || !itens?.length}
                onClick={() => ativarMutation.mutate(ficha!.id)}
              >
                <CheckCircle2 className="size-4" />
                {ativarMutation.isPending ? 'Ativando...' : `Colocar v${ficha!.versao} em vigor`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  pedirConfirmacao({
                    titulo: 'Descartar rascunho',
                    destrutivo: true,
                    rotuloConfirmar: 'Descartar',
                    descricao: <>A versão em vigor continua como está.</>,
                    aoConfirmar: () => descartarMutation.mutateAsync(ficha!.id),
                  })
                }
              >
                Descartar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={novaVersaoMutation.isPending || !!rascunho}
              onClick={() => novaVersaoMutation.mutate()}
            >
              <GitBranch className="size-4" />
              {fichas?.length ? 'Nova versão' : 'Criar ficha técnica'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
