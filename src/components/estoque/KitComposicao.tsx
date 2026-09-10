import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type KitItem = Tables<'produto_kit_itens'> & {
  componente: Tables<'produtos'>
}

export function KitComposicao({ kitId }: { kitId: string }) {
  const queryClient = useQueryClient()
  const [novoComponenteId, setNovoComponenteId] = useState('')
  const [novaQuantidade, setNovaQuantidade] = useState('1')

  const { data: itens, isLoading } = useQuery({
    queryKey: ['kit_itens', kitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produto_kit_itens')
        .select('*, componente:produtos!produto_kit_itens_componente_produto_id_fkey(*)')
        .eq('kit_produto_id', kitId)
      if (error) throw error
      return data as KitItem[]
    },
  })

  const { data: produtosDisponiveis } = useQuery({
    queryKey: ['produtos-select-nao-kit', kitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome')
        .eq('tipo', 'simples')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data
    },
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!novoComponenteId) throw new Error('Selecione um produto para adicionar ao kit.')
      const quantidade = Number(novaQuantidade)
      if (!(quantidade > 0)) throw new Error('Quantidade deve ser maior que zero.')

      const { error } = await supabase.from('produto_kit_itens').insert({
        kit_produto_id: kitId,
        componente_produto_id: novoComponenteId,
        quantidade,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit_itens', kitId] })
      setNovoComponenteId('')
      setNovaQuantidade('1')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const updateQuantidadeMutation = useMutation({
    mutationFn: async ({ id, quantidade }: { id: string; quantidade: number }) => {
      const { error } = await supabase
        .from('produto_kit_itens')
        .update({ quantidade })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kit_itens', kitId] }),
    onError: (error: Error) => toast.error(error.message),
  })

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('produto_kit_itens').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kit_itens', kitId] }),
    onError: (error: Error) => toast.error(error.message),
  })

  const componentesJaNoKit = new Set(itens?.map((i) => i.componente_produto_id))
  const opcoes = produtosDisponiveis?.filter((p) => !componentesJaNoKit.has(p.id)) ?? []

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">Componentes do kit</p>
      <p className="text-xs text-muted-foreground">
        Ao dar saída de 1 unidade deste kit, o estoque de cada componente abaixo é baixado
        automaticamente na quantidade indicada.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && itens?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum componente adicionado ainda.</p>
      )}

      {itens && itens.length > 0 && (
        <div className="space-y-1.5">
          {itens.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm">{item.componente.nome}</span>
              <Input
                type="number"
                min={0.001}
                step="0.001"
                defaultValue={item.quantidade}
                className="h-8 w-20"
                onBlur={(e) => {
                  const quantidade = Number(e.target.value)
                  if (quantidade > 0 && quantidade !== item.quantidade) {
                    updateQuantidadeMutation.mutate({ id: item.id, quantidade })
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeMutation.mutate(item.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t pt-3">
        <Select
          items={opcoes.map((p) => ({ value: p.id, label: p.nome }))}
          value={novoComponenteId}
          onValueChange={(v) => setNovoComponenteId(v ?? '')}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder="Adicionar produto..." />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={0.001}
          step="0.001"
          value={novaQuantidade}
          onChange={(e) => setNovaQuantidade(e.target.value)}
          className="h-8 w-20"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => addMutation.mutate()}
          disabled={addMutation.isPending}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
