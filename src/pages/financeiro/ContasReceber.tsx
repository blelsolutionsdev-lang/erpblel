import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
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
import { formatCurrency, formatDate } from '@/lib/format'
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

  const { data: contas, isLoading } = useQuery({
    queryKey: ['contas_receber'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select('*, cliente:clientes(*), categoria:categorias_financeiras(*)')
        .order('data_vencimento')
      if (error) throw error
      return data as ContaReceber[]
    },
  })

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
    onError: (error: Error) => toast.error(error.message),
  })

  const receberMutation = useMutation({
    mutationFn: async (conta: ContaReceber) => {
      const { error } = await supabase
        .from('contas_receber')
        .update({ status: 'pago', data_recebimento: new Date().toISOString().slice(0, 10) })
        .eq('id', conta.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Recebimento registrado.')
      queryClient.invalidateQueries({ queryKey: ['contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => toast.error(error.message),
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="valor">Valor</Label>
                    <Input id="valor" type="number" step="0.01" min={0} {...register('valor')} />
                    {errors.valor && <p className="text-xs text-destructive">{errors.valor.message}</p>}
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && contas?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhuma conta a receber cadastrada ainda.
                </TableCell>
              </TableRow>
            )}

            {contas?.map((conta) => (
              <TableRow key={conta.id}>
                <TableCell className="font-medium">{conta.cliente?.nome ?? '—'}</TableCell>
                <TableCell>
                  {conta.descricao}
                  {conta.origem_tipo === 'os' && (
                    <Badge variant="outline" className="ml-2">
                      gerada por OS
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(conta.data_vencimento)}</TableCell>
                <TableCell>{formatCurrency(conta.valor)}</TableCell>
                <TableCell>
                  <Badge variant={conta.status === 'pago' ? 'default' : 'secondary'}>
                    {statusLabel[conta.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {conta.status !== 'pago' && conta.status !== 'cancelado' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => receberMutation.mutate(conta)}
                      disabled={receberMutation.isPending}
                    >
                      Marcar como recebido
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
