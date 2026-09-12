import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Paginacao } from '@/components/Paginacao'
import { DataTable } from '@/components/DataTable'
import { CampoMoeda } from '@/components/campos/CampoMoeda'
import { BaixarTituloDialog, type TituloParaBaixa } from '@/components/financeiro/BaixarTituloDialog'
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
import { formatCurrency, formatDate } from '@/lib/format'
import { useBuscaUrl, useFiltrosUrl } from '@/hooks/use-filtros-url'
import { mensagemErro } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

type ContaReceber = Tables<'contas_receber'> & {
  cliente: Tables<'clientes'> | null
  categoria: Tables<'categorias_financeiras'> | null
}

const formSchema = z.object({
  cliente_id: z.string().min(1, 'Selecione um cliente'),
  categoria_id: z.string().optional(),
  descricao: z.string().min(2, 'Informe uma descrição'),
  valor: z.coerce.number().positive('Valor deve ser maior que zero'),
  data_vencimento: z.string().min(1, 'Informe o vencimento'),
})

type FormValues = z.infer<typeof formSchema>

const statusLabel: Record<Tables<'contas_receber'>['status'], string> = {
  pendente: 'Pendente',
  pago: 'Recebido',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
}

export function ContasReceber() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [baixando, setBaixando] = useState<TituloParaBaixa | null>(null)

  const { filtros, definir, pagina, setPagina, de, ate } = useFiltrosUrl({ q: '' })
  const { texto: busca, setTexto: setBusca } = useBuscaUrl(filtros.q, (q) => definir({ q }))

  const {
    data: resultado,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['contas_receber', filtros.q, pagina],
    queryFn: async () => {
      let query = supabase
        .from('contas_receber')
        .select('*, cliente:clientes(*), categoria:categorias_financeiras(*)', { count: 'exact' })
        .order('data_vencimento')
        .range(de, ate)

      const termo = filtros.q.trim()
      if (termo) {
        query = query.ilike('descricao', `%${termo}%`)
      }

      const { data, error, count } = await query
      if (error) throw error
      return { linhas: data as ContaReceber[], total: count }
    },
  })

  const contas = resultado?.linhas

  const { data: clientes } = useQuery({
    queryKey: ['clientes-select'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, nome').eq('ativo', true).order('nome')
      if (error) throw error
      return data
    },
  })

  const { data: categorias } = useQuery({
    queryKey: ['categorias_financeiras', 'receita'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_financeiras')
        .select('*')
        .eq('tipo', 'receita')
        .order('nome')
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
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { cliente_id: '', categoria_id: '', descricao: '', valor: 0, data_vencimento: '' },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: TablesInsert<'contas_receber'> = {
        cliente_id: values.cliente_id,
        categoria_id: values.categoria_id || null,
        descricao: values.descricao,
        valor: values.valor,
        data_vencimento: values.data_vencimento,
        origem_tipo: 'manual',
      }
      const { error } = await supabase.from('contas_receber').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Conta a receber cadastrada.')
      queryClient.invalidateQueries({ queryKey: ['contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setOpen(false)
      reset()
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const clienteId = watch('cliente_id')
  const categoriaId = watch('categoria_id')

  return (
    <div>
      <PageHeader
        title="Contas a receber"
        description="Títulos a receber, incluindo os gerados automaticamente ao concluir ordens de serviço"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" />
              Nova conta a receber
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nova conta a receber</DialogTitle>
              </DialogHeader>
              <form
                id="conta-receber-form"
                className="space-y-4"
                onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
              >
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select
                    items={clientes?.map((c) => ({ value: c.id, label: c.nome })) ?? []}
                    value={clienteId}
                    onValueChange={(v) => setValue('cliente_id', v ?? '')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.cliente_id && (
                    <p className="text-xs text-destructive">{errors.cliente_id.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    items={categorias?.map((c) => ({ value: c.id, label: c.nome })) ?? []}
                    value={categoriaId}
                    onValueChange={(v) => setValue('categoria_id', v ?? '')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Input id="descricao" {...register('descricao')} />
                  {errors.descricao && (
                    <p className="text-xs text-destructive">{errors.descricao.message}</p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="valor">Valor</Label>
                    <CampoMoeda id="valor" control={control} name="valor" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="data_vencimento">Vencimento</Label>
                    <Input id="data_vencimento" type="date" {...register('data_vencimento')} />
                    {errors.data_vencimento && (
                      <p className="text-xs text-destructive">{errors.data_vencimento.message}</p>
                    )}
                  </div>
                </div>
              </form>
              <DialogFooter>
                <Button type="submit" form="conta-receber-form" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
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
            placeholder="Buscar pela descrição do título..."
            className="pl-8"
          />
        </div>
      </div>

      <DataTable
        linhas={contas}
        carregando={isLoading}
        chave={(conta) => conta.id}
        vazio={filtros.q ? 'Nenhum título encontrado para essa busca.' : 'Nenhuma conta a receber cadastrada ainda.'}
        colunas={[
          {
            titulo: 'Descrição',
            mobile: 'titulo',
            celula: (conta) => (
              <div>
                <div className="font-medium">{conta.descricao}</div>
                <div className="text-xs text-muted-foreground">
                  {conta.cliente?.nome ?? '—'}
                  {conta.origem_tipo === 'os' && ' · gerada por OS'}
                </div>
              </div>
            ),
          },
          { titulo: 'Vencimento', celula: (conta) => formatDate(conta.data_vencimento) },
          { titulo: 'Valor', alinhar: 'direita', celula: (conta) => formatCurrency(conta.valor) },
          {
            titulo: 'Em aberto',
            alinhar: 'direita',
            celula: (conta) =>
              conta.status === 'pago' ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className={conta.valor_pago > 0 ? 'text-amber-600' : ''}>
                  {formatCurrency(conta.valor - conta.valor_pago)}
                </span>
              ),
          },
          {
            titulo: 'Status',
            celula: (conta) => (
              <Badge
                variant={
                  conta.status === 'pago'
                    ? 'default'
                    : conta.status === 'atrasado'
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {statusLabel[conta.status]}
              </Badge>
            ),
          },
        ]}
        acoes={(conta) =>
          conta.status !== 'pago' && conta.status !== 'cancelado' ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                setBaixando({
                  id: conta.id,
                  descricao: conta.descricao,
                  valor: conta.valor,
                  valor_pago: conta.valor_pago,
                })
              }
            >
              Baixar
            </Button>
          ) : null
        }
      />

      <Paginacao
        pagina={pagina}
        setPagina={setPagina}
        total={resultado?.total}
        carregando={isFetching}
      />

      <BaixarTituloDialog
        tipo="receber"
        titulo={baixando}
        onOpenChange={(v) => !v && setBaixando(null)}
      />
    </div>
  )
}
