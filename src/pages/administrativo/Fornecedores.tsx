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

type Fornecedor = Tables<'fornecedores'>

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
  dados_bancarios: z.object({
    banco: z.string().optional(),
    agencia: z.string().optional(),
    conta: z.string().optional(),
    pix: z.string().optional(),
  }),
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
  dados_bancarios: { banco: '', agencia: '', conta: '', pix: '' },
}

export function Fornecedores() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const podeGerenciar = hasPermission('administrativo.fornecedores.gerenciar')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Fornecedor | null>(null)

  const { filtros, definir, pagina, setPagina, de, ate } = useFiltrosUrl({ q: '' })
  const { texto: busca, setTexto: setBusca } = useBuscaUrl(filtros.q, (q) => definir({ q }))

  const {
    data: resultado,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['fornecedores', filtros.q, pagina],
    queryFn: async () => {
      let query = supabase
        .from('fornecedores')
        .select('*', { count: 'exact' })
        .order('nome')
        .range(de, ate)

      const termo = filtros.q.trim()
      if (termo) {
        query = query.or(`nome.ilike.%${termo}%,cpf_cnpj.ilike.%${termo}%,email.ilike.%${termo}%`)
      }

      const { data, error, count } = await query
      if (error) throw error
      return { linhas: data as Fornecedor[], total: count }
    },
  })

  const fornecedores = resultado?.linhas

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
      const banco = (editing.dados_bancarios ?? {}) as Record<string, string>
      reset({
        tipo_pessoa: editing.tipo_pessoa,
        nome: editing.nome,
        nome_fantasia: editing.nome_fantasia ?? '',
        cpf_cnpj: editing.cpf_cnpj ?? '',
        ie: editing.ie ?? '',
        email: editing.email ?? '',
        telefone: editing.telefone ?? '',
        observacoes: editing.observacoes ?? '',
        dados_bancarios: {
          banco: banco.banco ?? '',
          agencia: banco.agencia ?? '',
          conta: banco.conta ?? '',
          pix: banco.pix ?? '',
        },
      })
    } else {
      reset(emptyValues)
    }
  }, [editing, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: TablesInsert<'fornecedores'> = {
        tipo_pessoa: values.tipo_pessoa,
        nome: values.nome,
        nome_fantasia: values.nome_fantasia || null,
        cpf_cnpj: values.cpf_cnpj || null,
        ie: values.ie || null,
        email: values.email || null,
        telefone: values.telefone || null,
        observacoes: values.observacoes || null,
        dados_bancarios: values.dados_bancarios,
      }

      if (editing) {
        const { error } = await supabase.from('fornecedores').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('fornecedores').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.')
      queryClient.invalidateQueries({ queryKey: ['fornecedores'] })
      setOpen(false)
      setEditing(null)
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const toggleAtivoMutation = useMutation({
    mutationFn: async (fornecedor: Fornecedor) => {
      const { error } = await supabase
        .from('fornecedores')
        .update({ ativo: !fornecedor.ativo })
        .eq('id', fornecedor.id)
      if (error) throw error
      return !fornecedor.ativo
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fornecedores'] }),
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(fornecedor: Fornecedor) {
    setEditing(fornecedor)
    setOpen(true)
  }

  const tipoPessoa = watch('tipo_pessoa')

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description="Cadastro de fornecedores pessoa física e jurídica"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            {podeGerenciar && (
              <DialogTrigger render={<Button onClick={openNew} />}>
                <Plus className="size-4" />
                Novo fornecedor
              </DialogTrigger>
            )}
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? 'Editar fornecedor' : 'Novo fornecedor'}</DialogTitle>
              </DialogHeader>
              <form
                id="fornecedor-form"
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
                  <Label>Dados bancários</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Banco" {...register('dados_bancarios.banco')} />
                    <Input placeholder="Agência" {...register('dados_bancarios.agencia')} />
                    <Input placeholder="Conta" {...register('dados_bancarios.conta')} />
                    <Input placeholder="Chave Pix" {...register('dados_bancarios.pix')} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea id="observacoes" rows={2} {...register('observacoes')} />
                </div>
                </fieldset>
              </form>
              {podeGerenciar && (
              <DialogFooter>
<Button type="submit" form="fornecedor-form" disabled={saveMutation.isPending}>
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
        linhas={fornecedores}
        carregando={isLoading}
        chave={(fornecedor) => fornecedor.id}
        vazio={filtros.q ? 'Nenhum resultado para essa busca.' : 'Nenhum fornecedor cadastrado ainda.'}
        colunas={[
          {
            titulo: 'Nome',
            mobile: 'titulo',
            celula: (fornecedor) => (
              <div>
                <div className="font-medium">{fornecedor.nome}</div>
                {fornecedor.nome_fantasia && (
                  <div className="text-xs text-muted-foreground">{fornecedor.nome_fantasia}</div>
                )}
              </div>
            ),
          },
          { titulo: 'CPF/CNPJ', celula: (fornecedor) => fornecedor.cpf_cnpj ?? '—' },
          {
            titulo: 'Contato',
            celula: (fornecedor) => (
              <div>
                <div className="text-sm">{fornecedor.email ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{fornecedor.telefone ?? ''}</div>
              </div>
            ),
          },
          {
            titulo: 'Status',
            celula: (fornecedor) =>
              podeGerenciar ? (
                <button
                  type="button"
                  onClick={() => toggleAtivoMutation.mutate(fornecedor)}
                  disabled={toggleAtivoMutation.isPending}
                  title={fornecedor.ativo ? 'Desativar' : 'Reativar'}
                  className="rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Badge variant={fornecedor.ativo ? 'default' : 'secondary'}>
                    {fornecedor.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </button>
              ) : (
                <Badge variant={fornecedor.ativo ? 'default' : 'secondary'}>
                  {fornecedor.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              ),
          },
        ]}
        acoes={(fornecedor) => (
          <Button size="xs" variant="outline" onClick={() => openEdit(fornecedor)}>
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
