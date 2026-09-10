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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

type Cliente = Tables<'clientes'>

const enderecoSchema = z.object({
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
})

const formSchema = z.object({
  tipo_pessoa: z.enum(['PF', 'PJ']),
  nome: z.string().min(2, 'Informe o nome ou razão social'),
  nome_fantasia: z.string().optional(),
  cpf_cnpj: z.string().optional(),
  ie: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
  observacoes: z.string().optional(),
  endereco: enderecoSchema,
})

type FormValues = z.infer<typeof formSchema>

const emptyValues: FormValues = {
  tipo_pessoa: 'PJ',
  nome: '',
  nome_fantasia: '',
  cpf_cnpj: '',
  ie: '',
  email: '',
  telefone: '',
  observacoes: '',
  endereco: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' },
}

export function Clientes() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').order('nome')
      if (error) throw error
      return data
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (editing) {
      const endereco = (editing.endereco ?? {}) as Record<string, string>
      reset({
        tipo_pessoa: editing.tipo_pessoa,
        nome: editing.nome,
        nome_fantasia: editing.nome_fantasia ?? '',
        cpf_cnpj: editing.cpf_cnpj ?? '',
        ie: editing.ie ?? '',
        email: editing.email ?? '',
        telefone: editing.telefone ?? '',
        observacoes: editing.observacoes ?? '',
        endereco: {
          cep: endereco.cep ?? '',
          logradouro: endereco.logradouro ?? '',
          numero: endereco.numero ?? '',
          complemento: endereco.complemento ?? '',
          bairro: endereco.bairro ?? '',
          cidade: endereco.cidade ?? '',
          uf: endereco.uf ?? '',
        },
      })
    } else {
      reset(emptyValues)
    }
  }, [editing, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: TablesInsert<'clientes'> = {
        tipo_pessoa: values.tipo_pessoa,
        nome: values.nome,
        nome_fantasia: values.nome_fantasia || null,
        cpf_cnpj: values.cpf_cnpj || null,
        ie: values.ie || null,
        email: values.email || null,
        telefone: values.telefone || null,
        observacoes: values.observacoes || null,
        endereco: values.endereco,
      }

      if (editing) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clientes').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Cliente atualizado.' : 'Cliente cadastrado.')
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      setOpen(false)
      setEditing(null)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const toggleAtivoMutation = useMutation({
    mutationFn: async (cliente: Cliente) => {
      const { error } = await supabase
        .from('clientes')
        .update({ ativo: !cliente.ativo })
        .eq('id', cliente.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(cliente: Cliente) {
    setEditing(cliente)
    setOpen(true)
  }

  const tipoPessoa = watch('tipo_pessoa')

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cadastro de clientes pessoa física e jurídica"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button onClick={openNew} />}>
              <Plus className="size-4" />
              Novo cliente
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
              </DialogHeader>
              <form
                id="cliente-form"
                className="space-y-4"
                onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de pessoa</Label>
                    <Select
                      items={{ PJ: 'Pessoa jurídica', PF: 'Pessoa física' }}
                      value={tipoPessoa}
                      onValueChange={(v) => setValue('tipo_pessoa', (v ?? 'PJ') as 'PF' | 'PJ')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PJ">Pessoa jurídica</SelectItem>
                        <SelectItem value="PF">Pessoa física</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf_cnpj">{tipoPessoa === 'PF' ? 'CPF' : 'CNPJ'}</Label>
                    <Input id="cpf_cnpj" {...register('cpf_cnpj')} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nome">{tipoPessoa === 'PF' ? 'Nome completo' : 'Razão social'}</Label>
                  <Input id="nome" {...register('nome')} />
                  {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
                </div>

                {tipoPessoa === 'PJ' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nome_fantasia">Nome fantasia</Label>
                      <Input id="nome_fantasia" {...register('nome_fantasia')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ie">Inscrição estadual</Label>
                      <Input id="ie" {...register('ie')} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" {...register('email')} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone</Label>
                    <Input id="telefone" {...register('telefone')} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="CEP" {...register('endereco.cep')} />
                    <Input className="col-span-2" placeholder="Logradouro" {...register('endereco.logradouro')} />
                    <Input placeholder="Número" {...register('endereco.numero')} />
                    <Input placeholder="Complemento" {...register('endereco.complemento')} />
                    <Input placeholder="Bairro" {...register('endereco.bairro')} />
                    <Input placeholder="Cidade" {...register('endereco.cidade')} />
                    <Input placeholder="UF" maxLength={2} {...register('endereco.uf')} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea id="observacoes" rows={2} {...register('observacoes')} />
                </div>
              </form>
              <DialogFooter>
                <Button type="submit" form="cliente-form" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && clientes?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum cliente cadastrado ainda.
                </TableCell>
              </TableRow>
            )}

            {clientes?.map((cliente) => (
              <TableRow key={cliente.id}>
                <TableCell>
                  <div className="font-medium">{cliente.nome}</div>
                  {cliente.nome_fantasia && (
                    <div className="text-xs text-muted-foreground">{cliente.nome_fantasia}</div>
                  )}
                </TableCell>
                <TableCell>{cliente.cpf_cnpj ?? '—'}</TableCell>
                <TableCell>
                  <div className="text-sm">{cliente.email ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{cliente.telefone ?? ''}</div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={cliente.ativo ? 'default' : 'secondary'}
                    className="cursor-pointer"
                    onClick={() => toggleAtivoMutation.mutate(cliente)}
                  >
                    {cliente.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(cliente)}>
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
