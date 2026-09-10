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

type ContaPagar = Tables<'contas_pagar'> & {
  fornecedor: Tables<'fornecedores'> | null
  categoria: Tables<'categorias_financeiras'> | null
}

const formSchema = z.object({
  fornecedor_id: z.string().min(1, 'Selecione um fornecedor'),
  categoria_id: z.string().optional(),
  descricao: z.string().min(2, 'Informe uma descrição'),
  valor: z.coerce.number().positive('Valor deve ser maior que zero'),
  data_vencimento: z.string().min(1, 'Informe o vencimento'),
})

type FormValues = z.infer<typeof formSchema>

const statusLabel: Record<Tables<'contas_pagar'>['status'], string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
}

export function ContasPagar() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: contas, isLoading } = useQuery({
    queryKey: ['contas_pagar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_pagar')
        .select('*, fornecedor:fornecedores(*), categoria:categorias_financeiras(*)')
        .order('data_vencimento')
      if (error) throw error
      return data as ContaPagar[]
    },
  })

  const { data: fornecedores } = useQuery({
    queryKey: ['fornecedores-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data
    },
  })

  const { data: categorias } = useQuery({
    queryKey: ['categorias_financeiras', 'despesa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_financeiras')
        .select('*')
        .eq('tipo', 'despesa')
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
    defaultValues: { fornecedor_id: '', categoria_id: '', descricao: '', valor: 0, data_vencimento: '' },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: TablesInsert<'contas_pagar'> = {
        fornecedor_id: values.fornecedor_id,
        categoria_id: values.categoria_id || null,
        descricao: values.descricao,
        valor: values.valor,
        data_vencimento: values.data_vencimento,
        origem_tipo: 'manual',
      }
      const { error } = await supabase.from('contas_pagar').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Conta a pagar cadastrada.')
      queryClient.invalidateQueries({ queryKey: ['contas_pagar'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setOpen(false)
      reset()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const pagarMutation = useMutation({
    mutationFn: async (conta: ContaPagar) => {
      const { error } = await supabase
        .from('contas_pagar')
        .update({ status: 'pago', data_pagamento: new Date().toISOString().slice(0, 10) })
        .eq('id', conta.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Pagamento registrado.')
      queryClient.invalidateQueries({ queryKey: ['contas_pagar'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const fornecedorId = watch('fornecedor_id')
  const categoriaId = watch('categoria_id')

  return (
    <div>
      <PageHeader
        title="Contas a pagar"
        description="Títulos a pagar a fornecedores"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" />
              Nova conta a pagar
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nova conta a pagar</DialogTitle>
              </DialogHeader>
              <form
                id="conta-pagar-form"
                className="space-y-4"
                onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
              >
                <div className="space-y-2">
                  <Label>Fornecedor</Label>
                  <Select
                    items={fornecedores?.map((f) => ({ value: f.id, label: f.nome })) ?? []}
                    value={fornecedorId}
                    onValueChange={(v) => setValue('fornecedor_id', v ?? '')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {fornecedores?.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.fornecedor_id && (
                    <p className="text-xs text-destructive">{errors.fornecedor_id.message}</p>
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
                <Button type="submit" form="conta-pagar-form" disabled={saveMutation.isPending}>
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
              <TableHead>Fornecedor</TableHead>
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
                  Nenhuma conta a pagar cadastrada ainda.
                </TableCell>
              </TableRow>
            )}

            {contas?.map((conta) => (
              <TableRow key={conta.id}>
                <TableCell className="font-medium">{conta.fornecedor?.nome ?? '—'}</TableCell>
                <TableCell>{conta.descricao}</TableCell>
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
                      onClick={() => pagarMutation.mutate(conta)}
                      disabled={pagarMutation.isPending}
                    >
                      Marcar como pago
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
