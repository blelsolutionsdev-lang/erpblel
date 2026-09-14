import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Paginacao } from '@/components/Paginacao'
import { DataTable } from '@/components/DataTable'
import { CampoMascarado } from '@/components/campos/CampoMascarado'
import { EquipamentosCliente } from '@/components/administrativo/EquipamentosCliente'
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
import { Textarea } from '@/components/ui/textarea'
import { useBuscaUrl, useFiltrosUrl } from '@/hooks/use-filtros-url'
import { useAuth } from '@/lib/auth'
import { cpfCnpjValido, telefoneValido } from '@/lib/documentos'
import { mensagemErro } from '@/lib/erros'
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
  cpf_cnpj: z
    .string()
    .optional()
    .refine(cpfCnpjValido, 'CPF/CNPJ inválido'),
  ie: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional().refine(telefoneValido, 'Telefone incompleto'),
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
  const { hasPermission } = useAuth()
  const podeGerenciar = hasPermission('administrativo.clientes.gerenciar')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)

  const { filtros, definir, pagina, setPagina, de, ate } = useFiltrosUrl({ q: '' })
  const { texto: busca, setTexto: setBusca } = useBuscaUrl(filtros.q, (q) => definir({ q }))

  const {
    data: resultado,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['clientes', filtros.q, pagina],
    queryFn: async () => {
      let query = supabase
        .from('clientes')
        .select('*', { count: 'exact' })
        .order('nome')
        .range(de, ate)

      const termo = filtros.q.trim()
      if (termo) {
        query = query.or(`nome.ilike.%${termo}%,cpf_cnpj.ilike.%${termo}%,email.ilike.%${termo}%`)
      }

      const { data, error, count } = await query
      if (error) throw error
      return { linhas: data as Cliente[], total: count }
    },
  })

  const clientes = resultado?.linhas

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
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
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const toggleAtivoMutation = useMutation({
    mutationFn: async (cliente: Cliente) => {
      const { error } = await supabase
        .from('clientes')
        .update({ ativo: !cliente.ativo })
        .eq('id', cliente.id)
      if (error) throw error
      return !cliente.ativo
    },
    onSuccess: (ativo) => {
      toast.success(ativo ? 'Cadastro reativado.' : 'Cadastro desativado.')
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
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
            {podeGerenciar && (
              <DialogTrigger render={<Button onClick={openNew} />}>
                <Plus className="size-4" />
                Novo cliente
              </DialogTrigger>
            )}
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
              </DialogHeader>
              <form
                id="cliente-form"
                className="space-y-4"
                onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
              >
                <fieldset disabled={!podeGerenciar} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
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
                    <CampoMascarado
                      id="cpf_cnpj"
                      control={control}
                      name="cpf_cnpj"
                      mascara="cpfCnpj"
                      disabled={!podeGerenciar}
                      placeholder={tipoPessoa === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nome">{tipoPessoa === 'PF' ? 'Nome completo' : 'Razão social'}</Label>
                  <Input id="nome" {...register('nome')} />
                  {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
                </div>

                {tipoPessoa === 'PJ' && (
                  <div className="grid gap-4 sm:grid-cols-2">
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" {...register('email')} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone</Label>
                    <CampoMascarado
                      id="telefone"
                      control={control}
                      name="telefone"
                      mascara="telefone"
                      disabled={!podeGerenciar}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <CampoMascarado
                      control={control}
                      name="endereco.cep"
                      mascara="cep"
                      disabled={!podeGerenciar}
                      placeholder="CEP"
                    />
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
                </fieldset>
              </form>

              {editing ? (
                <EquipamentosCliente clienteId={editing.id} editavel={podeGerenciar} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Salve o cliente primeiro para cadastrar os equipamentos dele.
                </p>
              )}
              {podeGerenciar && (
              <DialogFooter>
<Button type="submit" form="cliente-form" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ ou e-mail..."
            className="pl-8"
          />
        </div>
      </div>

      <DataTable
        linhas={clientes}
        carregando={isLoading}
        chave={(cliente) => cliente.id}
        vazio={filtros.q ? 'Nenhum resultado para essa busca.' : 'Nenhum cliente cadastrado ainda.'}
        colunas={[
          {
            titulo: 'Nome',
            mobile: 'titulo',
            celula: (cliente) => (
              <div>
                <div className="font-medium">{cliente.nome}</div>
                {cliente.nome_fantasia && (
                  <div className="text-xs text-muted-foreground">{cliente.nome_fantasia}</div>
                )}
              </div>
            ),
          },
          { titulo: 'CPF/CNPJ', celula: (cliente) => cliente.cpf_cnpj ?? '—' },
          {
            titulo: 'Contato',
            celula: (cliente) => (
              <div>
                <div className="text-sm">{cliente.email ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{cliente.telefone ?? ''}</div>
              </div>
            ),
          },
          {
            titulo: 'Status',
            celula: (cliente) =>
              podeGerenciar ? (
                <button
                  type="button"
                  onClick={() => toggleAtivoMutation.mutate(cliente)}
                  disabled={toggleAtivoMutation.isPending}
                  title={cliente.ativo ? 'Desativar' : 'Reativar'}
                  className="rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Badge variant={cliente.ativo ? 'default' : 'secondary'}>
                    {cliente.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </button>
              ) : (
                <Badge variant={cliente.ativo ? 'default' : 'secondary'}>
                  {cliente.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              ),
          },
        ]}
        acoes={(cliente) => (
          <Button size="xs" variant="outline" onClick={() => openEdit(cliente)}>
            <Pencil className="size-3.5" />
            {podeGerenciar ? 'Editar' : 'Ver'}
          </Button>
        )}
      />

      <Paginacao
        pagina={pagina}
        setPagina={setPagina}
        total={resultado?.total}
        carregando={isFetching}
      />
    </div>
  )
}
