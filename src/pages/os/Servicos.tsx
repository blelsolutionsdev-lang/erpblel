import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import { mensagemErro } from '@/lib/erros'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

type Servico = Tables<'servicos'>

const formSchema = z.object({
  nome: z.string().min(2, 'Informe o nome do serviço'),
  descricao: z.string().optional(),
  preco: z.coerce.number().min(0),
})

type FormValues = z.infer<typeof formSchema>

const emptyValues: FormValues = { nome: '', descricao: '', preco: 0 }

export function Servicos() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const podeGerenciar = hasPermission('os.servicos.gerenciar')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Servico | null>(null)

  const { data: servicos, isLoading } = useQuery({
    queryKey: ['servicos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('servicos').select('*').order('nome').limit(500)
      if (error) throw error
      return data
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (editing) {
      reset({ nome: editing.nome, descricao: editing.descricao ?? '', preco: editing.preco })
    } else {
      reset(emptyValues)
    }
  }, [editing, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: TablesInsert<'servicos'> = {
        nome: values.nome,
        descricao: values.descricao || null,
        preco: values.preco,
      }

      if (editing) {
        const { error } = await supabase.from('servicos').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('servicos').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Serviço atualizado.' : 'Serviço cadastrado.')
      queryClient.invalidateQueries({ queryKey: ['servicos'] })
      setOpen(false)
      setEditing(null)
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const toggleAtivoMutation = useMutation({
    mutationFn: async (servico: Servico) => {
      const { error } = await supabase
        .from('servicos')
        .update({ ativo: !servico.ativo })
        .eq('id', servico.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['servicos'] }),
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(servico: Servico) {
    setEditing(servico)
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Serviços"
        description="Catálogo de serviços com preço padrão, usado para o cálculo automático nas ordens de serviço"
        actions={
          podeGerenciar && (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              Novo serviço
            </Button>
          )
        }
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setEditing(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? (podeGerenciar ? 'Editar serviço' : editing.nome) : 'Novo serviço'}
            </DialogTitle>
          </DialogHeader>
          <form
            id="servico-form"
            className="space-y-4"
            onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
          >
            <fieldset disabled={!podeGerenciar} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" {...register('nome')} />
                {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="preco">Preço padrão</Label>
                <Input id="preco" type="number" step="0.01" min={0} {...register('preco')} />
                <p className="text-xs text-muted-foreground">
                  Valor sugerido automaticamente ao adicionar este serviço numa OS — pode ser
                  ajustado por linha se precisar.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea id="descricao" rows={2} {...register('descricao')} />
              </div>
            </fieldset>
          </form>
          {podeGerenciar && (
            <DialogFooter>
              <Button type="submit" form="servico-form" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Preço padrão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && servicos?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Nenhum serviço cadastrado ainda.
                </TableCell>
              </TableRow>
            )}

            {servicos?.map((servico) => (
              <TableRow key={servico.id}>
                <TableCell>
                  <div className="font-medium">{servico.nome}</div>
                  {servico.descricao && (
                    <div className="text-xs text-muted-foreground">{servico.descricao}</div>
                  )}
                </TableCell>
                <TableCell>{formatCurrency(servico.preco)}</TableCell>
                <TableCell>
                  <Badge
                    variant={servico.ativo ? 'default' : 'secondary'}
                    className={podeGerenciar ? 'cursor-pointer' : ''}
                    onClick={() => podeGerenciar && toggleAtivoMutation.mutate(servico)}
                  >
                    {servico.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(servico)}>
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
