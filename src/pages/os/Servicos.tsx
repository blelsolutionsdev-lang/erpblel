import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { DataTable } from '@/components/DataTable'
import { CampoMoeda } from '@/components/campos/CampoMoeda'
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
import { Search } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useFiltrosUrl, useBuscaUrl } from '@/hooks/use-filtros-url'
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
  const { filtros, definir } = useFiltrosUrl({ q: '' })
  const { texto: busca, setTexto: setBusca } = useBuscaUrl(filtros.q, (q) => definir({ q }))
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Servico | null>(null)

  const { data: servicos, isLoading } = useQuery({
    queryKey: ['servicos', filtros.q],
    queryFn: async () => {
      let query = supabase.from('servicos').select('*').order('nome').limit(200)
      if (filtros.q.trim()) query = query.ilike('nome', `%${filtros.q.trim()}%`)
      const { data, error } = await query
      if (error) throw error
      return data as Servico[]
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    control,
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
      return !servico.ativo
    },
    onSuccess: (ativo) => {
      toast.success(ativo ? 'Serviço reativado.' : 'Serviço desativado.')
      queryClient.invalidateQueries({ queryKey: ['servicos'] })
    },
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
                <CampoMoeda id="preco" control={control} name="preco" disabled={!podeGerenciar} />
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

      <div className="mb-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar serviço..."
            className="pl-8"
            aria-label="Buscar serviços"
          />
        </div>
      </div>

      <DataTable
        linhas={servicos}
        carregando={isLoading}
        chave={(servico) => servico.id}
        vazio={filtros.q ? 'Nenhum serviço encontrado.' : 'Nenhum serviço cadastrado ainda.'}
        colunas={[
          {
            titulo: 'Serviço',
            mobile: 'titulo',
            celula: (servico) => (
              <div>
                <div className="font-medium">{servico.nome}</div>
                {servico.descricao && (
                  <div className="text-xs text-muted-foreground">{servico.descricao}</div>
                )}
              </div>
            ),
          },
          {
            titulo: 'Preço padrão',
            alinhar: 'direita',
            celula: (servico) => formatCurrency(servico.preco),
          },
          {
            titulo: 'Status',
            celula: (servico) =>
              podeGerenciar ? (
                <button
                  type="button"
                  onClick={() => toggleAtivoMutation.mutate(servico)}
                  disabled={toggleAtivoMutation.isPending}
                  title={servico.ativo ? 'Desativar serviço' : 'Reativar serviço'}
                  className="rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Badge variant={servico.ativo ? 'default' : 'secondary'}>
                    {servico.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </button>
              ) : (
                <Badge variant={servico.ativo ? 'default' : 'secondary'}>
                  {servico.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              ),
          },
        ]}
        acoes={(servico) => (
          <Button size="xs" variant="outline" onClick={() => openEdit(servico)}>
            <Pencil className="size-3.5" />
            {podeGerenciar ? 'Editar' : 'Ver'}
          </Button>
        )}
      />
    </div>
  )
}
