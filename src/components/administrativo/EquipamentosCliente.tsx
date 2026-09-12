import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HardDrive, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mensagemErro } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type Equipamento = Tables<'equipamentos'>

const vazio = { tipo: '', marca: '', modelo: '', numero_serie: '' }

/**
 * Cadastro dos aparelhos do cliente. Sem isso a OS não dizia *qual*
 * equipamento foi consertado — e a sub-OS de garantia "herdava" um
 * equipamento que era sempre nulo.
 */
export function EquipamentosCliente({
  clienteId,
  editavel = true,
}: {
  clienteId: string
  editavel?: boolean
}) {
  const queryClient = useQueryClient()
  const [novo, setNovo] = useState(vazio)

  const { data: equipamentos, isLoading } = useQuery({
    queryKey: ['equipamentos', clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipamentos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at')
      if (error) throw error
      return data as Equipamento[]
    },
  })

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['equipamentos', clienteId] })
    queryClient.invalidateQueries({ queryKey: ['equipamentos-select'] })
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!novo.tipo.trim() && !novo.modelo.trim()) {
        throw new Error('Informe pelo menos o tipo ou o modelo do equipamento.')
      }
      const { error } = await supabase.from('equipamentos').insert({
        cliente_id: clienteId,
        tipo: novo.tipo || null,
        marca: novo.marca || null,
        modelo: novo.modelo || null,
        numero_serie: novo.numero_serie || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidar()
      setNovo(vazio)
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const toggleMutation = useMutation({
    mutationFn: async (equipamento: Equipamento) => {
      const { error } = await supabase
        .from('equipamentos')
        .update({ ativo: !equipamento.ativo })
        .eq('id', equipamento.id)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('equipamentos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <HardDrive className="size-4" />
        Equipamentos do cliente
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && equipamentos?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum equipamento cadastrado. O equipamento é o que a OS conserta — cadastre aqui para
          poder selecioná-lo na ordem de serviço.
        </p>
      )}

      {equipamentos && equipamentos.length > 0 && (
        <div className="space-y-1.5">
          {equipamentos.map((eq) => (
            <div key={eq.id} className="flex items-center gap-2 text-sm">
              <div className="flex-1 truncate">
                <span className="font-medium">
                  {[eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' · ') || 'Equipamento'}
                </span>
                {eq.numero_serie && (
                  <span className="ml-2 text-xs text-muted-foreground">nº {eq.numero_serie}</span>
                )}
              </div>
              <Badge
                variant={eq.ativo ? 'default' : 'secondary'}
                className={editavel ? 'cursor-pointer' : ''}
                onClick={() => editavel && toggleMutation.mutate(eq)}
              >
                {eq.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
              {editavel && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Excluir equipamento"
                  onClick={() => removeMutation.mutate(eq.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {editavel && (
        <div className="grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-5">
          <Input
            className="h-8"
            placeholder="Tipo (ar, geladeira...)"
            value={novo.tipo}
            onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}
          />
          <Input
            className="h-8"
            placeholder="Marca"
            value={novo.marca}
            onChange={(e) => setNovo({ ...novo, marca: e.target.value })}
          />
          <Input
            className="h-8"
            placeholder="Modelo"
            value={novo.modelo}
            onChange={(e) => setNovo({ ...novo, modelo: e.target.value })}
          />
          <Input
            className="h-8"
            placeholder="Nº de série"
            value={novo.numero_serie}
            onChange={(e) => setNovo({ ...novo, numero_serie: e.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending}
          >
            <Plus className="size-3.5" />
            Adicionar
          </Button>
        </div>
      )}
    </div>
  )
}
