import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Trash2, Wrench } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirmacao } from '@/components/ConfirmDialog'
import { Combobox } from '@/components/campos/Combobox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buscarProdutos, buscarServicos } from '@/lib/buscas'
import { mensagemErro } from '@/lib/erros'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type OsItem = Tables<'ordens_servico_itens'>

/** Linha de item: quantidade e valor são controlados e só gravam ao sair do campo. */
function LinhaItem({
  item,
  editavel,
  aoAtualizar,
  aoRemover,
}: {
  item: OsItem
  editavel: boolean
  aoAtualizar: (patch: Partial<Pick<OsItem, 'quantidade' | 'valor_unitario'>>) => void
  aoRemover: () => void
}) {
  // `value` em vez de `defaultValue`: com defaultValue o campo continuava
  // mostrando o número antigo quando o valor mudava no servidor.
  const [quantidade, setQuantidade] = useState(String(item.quantidade))
  const [valor, setValor] = useState(String(item.valor_unitario))

  return (
    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
      <span className="w-full flex-1 truncate text-sm sm:w-auto">{item.descricao}</span>
      <Input
        type="number"
        inputMode="decimal"
        min={0.001}
        step="0.001"
        value={quantidade}
        disabled={!editavel}
        aria-label={`Quantidade de ${item.descricao}`}
        className="h-8 w-20"
        onChange={(e) => setQuantidade(e.target.value)}
        onBlur={() => {
          const novo = Number(quantidade)
          if (novo > 0 && novo !== item.quantidade) aoAtualizar({ quantidade: novo })
          else setQuantidade(String(item.quantidade))
        }}
      />
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={valor}
        disabled={!editavel}
        aria-label={`Valor unitário de ${item.descricao}`}
        className="h-8 w-24"
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => {
          const novo = Number(valor)
          if (novo >= 0 && novo !== item.valor_unitario) aoAtualizar({ valor_unitario: novo })
          else setValor(String(item.valor_unitario))
        }}
      />
      <span className="w-24 text-right text-sm font-medium">{formatCurrency(item.valor_total)}</span>
      {editavel && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={`Remover ${item.descricao}`}
          onClick={aoRemover}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

export function OsItensManager({ osId, editavel }: { osId: string; editavel: boolean }) {
  const queryClient = useQueryClient()
  const { pedirConfirmacao, dialogoConfirmacao } = useConfirmacao()

  const [produtoId, setProdutoId] = useState('')
  const [produtoQtd, setProdutoQtd] = useState('1')
  const [produtoValor, setProdutoValor] = useState('')

  const [servicoId, setServicoId] = useState('')
  const [servicoQtd, setServicoQtd] = useState('1')
  const [servicoValor, setServicoValor] = useState('')

  const { data: itens, isLoading } = useQuery({
    queryKey: ['os_itens', osId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_servico_itens')
        .select('*')
        .eq('os_id', osId)
        .order('created_at')
      if (error) throw error
      return data as OsItem[]
    },
  })

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['os_itens', osId] })
    queryClient.invalidateQueries({ queryKey: ['ordens_servico'] })
    // A OS em edição é carregada por uma query própria: sem invalidar aqui, o
    // resumo de valores do diálogo ficava parado no valor anterior.
    queryClient.invalidateQueries({ queryKey: ['ordem_servico', osId] })
    queryClient.invalidateQueries({ queryKey: ['produtos-comprometido'] })
  }

  const addProdutoMutation = useMutation({
    mutationFn: async () => {
      if (!produtoId) throw new Error('Selecione um produto ou kit.')
      const quantidade = Number(produtoQtd)
      if (!(quantidade > 0)) throw new Error('Quantidade deve ser maior que zero.')

      const { data: produto, error: erroProduto } = await supabase
        .from('produtos')
        .select('id, nome, preco_venda')
        .eq('id', produtoId)
        .single()
      if (erroProduto) throw erroProduto

      const valor_unitario = produtoValor === '' ? produto.preco_venda : Number(produtoValor)

      const { error } = await supabase.from('ordens_servico_itens').insert({
        os_id: osId,
        tipo: 'peca',
        produto_id: produto.id,
        descricao: produto.nome,
        quantidade,
        valor_unitario,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidar()
      setProdutoId('')
      setProdutoQtd('1')
      setProdutoValor('')
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const addServicoMutation = useMutation({
    mutationFn: async () => {
      if (!servicoId) throw new Error('Selecione um serviço.')
      const quantidade = Number(servicoQtd)
      if (!(quantidade > 0)) throw new Error('Quantidade deve ser maior que zero.')

      const { data: servico, error: erroServico } = await supabase
        .from('servicos')
        .select('id, nome, preco')
        .eq('id', servicoId)
        .single()
      if (erroServico) throw erroServico

      const valor_unitario = servicoValor === '' ? servico.preco : Number(servicoValor)

      const { error } = await supabase.from('ordens_servico_itens').insert({
        os_id: osId,
        tipo: 'servico',
        servico_id: servico.id,
        descricao: servico.nome,
        quantidade,
        valor_unitario,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidar()
      setServicoId('')
      setServicoQtd('1')
      setServicoValor('')
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const updateItemMutation = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<Pick<OsItem, 'quantidade' | 'valor_unitario'>>
    }) => {
      const { error } = await supabase.from('ordens_servico_itens').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ordens_servico_itens').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  function confirmarRemocao(item: OsItem) {
    pedirConfirmacao({
      titulo: 'Remover item da OS',
      destrutivo: true,
      rotuloConfirmar: 'Remover',
      descricao: (
        <>
          <strong>{item.descricao}</strong> sai da OS e o total é recalculado.
        </>
      ),
      aoConfirmar: () => removeItemMutation.mutateAsync(item.id),
    })
  }

  const pecas = itens?.filter((i) => i.tipo === 'peca') ?? []
  const servicosItens = itens?.filter((i) => i.tipo === 'servico') ?? []

  return (
    <div className="space-y-4 rounded-lg border p-3">
      {dialogoConfirmacao}

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Package className="size-4" />
          Produtos e kits
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && pecas.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum produto adicionado ainda.</p>
        )}

        {pecas.length > 0 && (
          <div className="space-y-1.5">
            {pecas.map((item) => (
              <LinhaItem
                key={`${item.id}-${item.quantidade}-${item.valor_unitario}`}
                item={item}
                editavel={editavel}
                aoAtualizar={(patch) => updateItemMutation.mutate({ id: item.id, patch })}
                aoRemover={() => confirmarRemocao(item)}
              />
            ))}
          </div>
        )}

        {editavel && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3 sm:flex-nowrap">
            <Combobox
              className="w-full sm:flex-1"
              queryKey="produtos"
              valor={produtoId}
              buscar={buscarProdutos}
              placeholder="Adicionar produto ou kit..."
              aoSelecionar={(v, opcao) => {
                setProdutoId(v)
                // O preço sugerido vem do catálogo; o usuário pode sobrescrever.
                if (opcao) void sugerirPrecoProduto(v, setProdutoValor)
              }}
            />
            <Input
              type="number"
              inputMode="decimal"
              min={0.001}
              step="0.001"
              value={produtoQtd}
              onChange={(e) => setProdutoQtd(e.target.value)}
              className="h-8 w-20"
              aria-label="Quantidade do produto"
            />
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={produtoValor}
              onChange={(e) => setProdutoValor(e.target.value)}
              placeholder="Valor"
              className="h-8 w-24"
              aria-label="Valor unitário do produto"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => addProdutoMutation.mutate()}
              disabled={addProdutoMutation.isPending}
            >
              <Package className="size-3.5" />
              Adicionar
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Wrench className="size-4" />
          Serviços
        </p>

        {!isLoading && servicosItens.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum serviço adicionado ainda.</p>
        )}

        {servicosItens.length > 0 && (
          <div className="space-y-1.5">
            {servicosItens.map((item) => (
              <LinhaItem
                key={`${item.id}-${item.quantidade}-${item.valor_unitario}`}
                item={item}
                editavel={editavel}
                aoAtualizar={(patch) => updateItemMutation.mutate({ id: item.id, patch })}
                aoRemover={() => confirmarRemocao(item)}
              />
            ))}
          </div>
        )}

        {editavel && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3 sm:flex-nowrap">
            <Combobox
              className="w-full sm:flex-1"
              queryKey="servicos"
              valor={servicoId}
              buscar={buscarServicos}
              placeholder="Adicionar serviço..."
              aoSelecionar={(v) => {
                setServicoId(v)
                if (v) void sugerirPrecoServico(v, setServicoValor)
              }}
            />
            <Input
              type="number"
              inputMode="decimal"
              min={0.001}
              step="0.001"
              value={servicoQtd}
              onChange={(e) => setServicoQtd(e.target.value)}
              className="h-8 w-20"
              aria-label="Quantidade do serviço"
            />
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={servicoValor}
              onChange={(e) => setServicoValor(e.target.value)}
              placeholder="Valor"
              className="h-8 w-24"
              aria-label="Valor unitário do serviço"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => addServicoMutation.mutate()}
              disabled={addServicoMutation.isPending}
            >
              <Wrench className="size-3.5" />
              Adicionar
            </Button>
          </div>
        )}
      </div>

      {!editavel && (
        <p className="text-xs text-muted-foreground">
          <Badge variant="outline" className="mr-1.5">
            Somente leitura
          </Badge>
          Esta OS não pode mais ter itens alterados.
        </p>
      )}
    </div>
  )
}

async function sugerirPrecoProduto(id: string, definir: (valor: string) => void) {
  const { data } = await supabase.from('produtos').select('preco_venda').eq('id', id).maybeSingle()
  if (data) definir(String(data.preco_venda))
}

async function sugerirPrecoServico(id: string, definir: (valor: string) => void) {
  const { data } = await supabase.from('servicos').select('preco').eq('id', id).maybeSingle()
  if (data) definir(String(data.preco))
}
