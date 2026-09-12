import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/lib/auth'
import { mensagemErro } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type Categoria = Tables<'categorias_produtos'>

/**
 * O cadastro de produto sempre teve o seletor de categoria, mas não existia
 * tela para criar categoria nenhuma — o seletor nunca tinha opção.
 */
export function Categorias() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const podeGerenciar = hasPermission('estoque.produtos.gerenciar')
  const [nome, setNome] = useState('')

  const { data: categorias, isLoading } = useQuery({
    queryKey: ['categorias_produtos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_produtos')
        .select('*')
        .order('nome')
        .limit(500)
      if (error) throw error
      return data as Categoria[]
    },
  })

  const { data: contagem } = useQuery({
    queryKey: ['categorias_produtos_contagem'],
    queryFn: async () => {
      const { data, error } = await supabase.from('produtos').select('categoria_id')
      if (error) throw error
      const mapa = new Map<string, number>()
      for (const p of data ?? []) {
        if (p.categoria_id) mapa.set(p.categoria_id, (mapa.get(p.categoria_id) ?? 0) + 1)
      }
      return mapa
    },
  })

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['categorias_produtos'] })
    queryClient.invalidateQueries({ queryKey: ['categorias_produtos_contagem'] })
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error('Informe o nome da categoria.')
      const { error } = await supabase.from('categorias_produtos').insert({ nome: nome.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Categoria criada.')
      invalidar()
      setNome('')
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const renameMutation = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from('categorias_produtos').update({ nome }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categorias_produtos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Categoria removida.')
      invalidar()
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  return (
    <div>
      <PageHeader
        title="Categorias de produtos"
        description="Agrupamento usado no cadastro de produtos e nos relatórios de estoque"
      />

      {podeGerenciar && (
        <div className="mb-3 flex max-w-md gap-2">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da nova categoria"
            onKeyDown={(e) => {
              if (e.key === 'Enter') addMutation.mutate()
            }}
          />
          <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
            <Plus className="size-4" />
            Criar
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead className="w-32">Produtos</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && categorias?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  Nenhuma categoria cadastrada ainda.
                </TableCell>
              </TableRow>
            )}

            {categorias?.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell>
                  <Input
                    defaultValue={cat.nome}
                    disabled={!podeGerenciar}
                    className="h-8 max-w-sm"
                    onBlur={(e) => {
                      const novo = e.target.value.trim()
                      if (novo && novo !== cat.nome) {
                        renameMutation.mutate({ id: cat.id, nome: novo })
                      }
                    }}
                  />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {contagem?.get(cat.id) ?? 0}
                </TableCell>
                <TableCell>
                  {podeGerenciar && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Remover categoria"
                      onClick={() => removeMutation.mutate(cat.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
