import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Trash2, Wrench } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { mensagemErro } from '@/lib/erros'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type OsItem = Tables<'ordens_servico_itens'>

export function OsItensManager({ osId, editavel }: { osId: string; editavel: boolean }) {
  const queryClient = useQueryClient()

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

  const { data: produtos } = useQuery({
    queryKey: ['produtos-select-os'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, tipo, preco_venda')
        .eq('ativo', true)
        .order('nome')
        .limit(1000)
      if (error) throw error
      return data
    },
  })

  const { data: servicos } = useQuery({
    queryKey: ['servicos-select-os'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servicos')
        .select('id, nome, preco')
        .eq('ativo', true)
        .order('nome')
        .limit(1000)
      if (error) throw error
      return data
    },
  })

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['os_itens', osId] })
    queryClient.invalidateQueries({ queryKey: ['ordens_servico'] })
    // A OS em edição é carregada por uma query própria: sem invalidar aqui, o
    // resumo de valores do diálogo ficava parado no valor anterior.
    queryClient.invalidateQueries({ queryKey: ['ordem_servico', osId] })
  }

  const addProdutoMutation = useMutation({
    mutationFn: async () => {
      const produto = produtos?.find((p) => p.id === produtoId)
      if (!produto) throw new Error('Selecione um produto ou kit.')
      const quantidade = Number(produtoQtd)
      if (!(quantidade > 0)) throw new Error('Quantidade deve ser maior que zero.')
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
      const servico = servicos?.find((s) => s.id === servicoId)
      if (!servico) throw new Error('Selecione um serviço.')
      const quantidade = Number(servicoQtd)
      if (!(quantidade > 0)) throw new Error('Quantidade deve ser maior que zero.')
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
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<OsItem, 'quantidade' | 'valor_unitario'>> }) => {
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

  const pecas = itens?.filter((i) => i.tipo === 'peca') ?? []
  const servicosItens = itens?.filter((i) => i.tipo === 'servico') ?? []

  return (
    <div className="space-y-4 rounded-lg border p-3">
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
              <div key={item.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">{item.descricao}</span>
                <Input
                  type="number"
                  min={0.001}
                  step="0.001"
                  defaultValue={item.quantidade}
                  disabled={!editavel}
                  className="h-8 w-20"
                  onBlur={(e) => {
                    const quantidade = Number(e.target.value)
                    if (quantidade > 0 && quantidade !== item.quantidade) {
                      updateItemMutation.mutate({ id: item.id, patch: { quantidade } })
                    }
                  }}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={item.valor_unitario}
                  disabled={!editavel}
                  className="h-8 w-24"
                  onBlur={(e) => {
                    const valor_unitario = Number(e.target.value)
                    if (valor_unitario >= 0 && valor_unitario !== item.valor_unitario) {
                      updateItemMutation.mutate({ id: item.id, patch: { valor_unitario } })
                    }
                  }}
                />
                <span className="w-24 text-right text-sm font-medium">
                  {formatCurrency(item.valor_total)}
                </span>
                {editavel && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeItemMutation.mutate(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {editavel && (
          <div className="flex items-center gap-2 border-t pt-3">
            <Select
              items={produtos?.map((p) => ({ value: p.id, label: p.nome })) ?? []}
              value={produtoId}
              onValueChange={(v) => {
                setProdutoId(v ?? '')
                const produto = produtos?.find((p) => p.id === v)
                setProdutoValor(produto ? String(produto.preco_venda) : '')
              }}
            >
              <SelectTrigger className="h-8 flex-1">
                <SelectValue placeholder="Adicionar produto ou kit..." />
              </SelectTrigger>
              <SelectContent>
                {produtos?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                    {p.tipo === 'kit' ? ' (kit)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0.001}
              step="0.001"
              value={produtoQtd}
              onChange={(e) => setProdutoQtd(e.target.value)}
              className="h-8 w-20"
              aria-label="Quantidade"
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              value={produtoValor}
              onChange={(e) => setProdutoValor(e.target.value)}
              placeholder="Valor"
              className="h-8 w-24"
              aria-label="Valor unitário"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => addProdutoMutation.mutate()}
              disabled={addProdutoMutation.isPending}
            >
              <Package className="size-3.5" />
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
              <div key={item.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">{item.descricao}</span>
                <Input
                  type="number"
                  min={0.001}
                  step="0.001"
                  defaultValue={item.quantidade}
                  disabled={!editavel}
                  className="h-8 w-20"
                  onBlur={(e) => {
                    const quantidade = Number(e.target.value)
                    if (quantidade > 0 && quantidade !== item.quantidade) {
                      updateItemMutation.mutate({ id: item.id, patch: { quantidade } })
                    }
                  }}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={item.valor_unitario}
                  disabled={!editavel}
                  className="h-8 w-24"
                  onBlur={(e) => {
                    const valor_unitario = Number(e.target.value)
                    if (valor_unitario >= 0 && valor_unitario !== item.valor_unitario) {
                      updateItemMutation.mutate({ id: item.id, patch: { valor_unitario } })
                    }
                  }}
                />
                <span className="w-24 text-right text-sm font-medium">
                  {formatCurrency(item.valor_total)}
                </span>
                {editavel && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeItemMutation.mutate(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {editavel && (
          <div className="flex items-center gap-2 border-t pt-3">
            <Select
              items={servicos?.map((s) => ({ value: s.id, label: s.nome })) ?? []}
              value={servicoId}
              onValueChange={(v) => {
                setServicoId(v ?? '')
                const servico = servicos?.find((s) => s.id === v)
                setServicoValor(servico ? String(servico.preco) : '')
              }}
            >
              <SelectTrigger className="h-8 flex-1">
                <SelectValue placeholder="Adicionar serviço..." />
              </SelectTrigger>
              <SelectContent>
                {servicos?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0.001}
              step="0.001"
              value={servicoQtd}
              onChange={(e) => setServicoQtd(e.target.value)}
              className="h-8 w-20"
              aria-label="Quantidade"
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              value={servicoValor}
              onChange={(e) => setServicoValor(e.target.value)}
              placeholder="Valor"
              className="h-8 w-24"
              aria-label="Valor unitário"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => addServicoMutation.mutate()}
              disabled={addServicoMutation.isPending}
            >
              <Wrench className="size-3.5" />
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
