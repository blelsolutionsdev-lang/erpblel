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
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Enums, Tables, TablesInsert } from '@/types/database'

type OrdemServico = Tables<'ordens_servico'> & {
  cliente: Tables<'clientes'> | null
  tecnico: Tables<'profiles'> | null
}

type Status = Enums<'os_status'>

const statusLabel: Record<Status, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

const statusVariant: Record<Status, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  aberta: 'secondary',
  em_andamento: 'default',
  aguardando_peca: 'outline',
  concluida: 'default',
  cancelada: 'destructive',
}

const formSchema = z.object({
  cliente_id: z.string().min(1, 'Selecione um cliente'),
  tecnico_id: z.string().optional(),
  problema_relatado: z.string().min(2, 'Descreva o problema relatado'),
  valor_pecas: z.coerce.number().min(0),
  valor_servicos: z.coerce.number().min(0),
})

type FormValues = z.infer<typeof formSchema>

export function OrdensServico() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: ordens, isLoading } = useQuery({
    queryKey: ['ordens_servico'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*, cliente:clientes(*), tecnico:profiles(*)')
        .order('numero', { ascending: false })
      if (error) throw error
      return data as OrdemServico[]
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

  const { data: tecnicos } = useQuery({
    queryKey: ['tecnicos-select'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, nome').eq('ativo', true).order('nome')
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
    defaultValues: { cliente_id: '', tecnico_id: '', problema_relatado: '', valor_pecas: 0, valor_servicos: 0 },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: TablesInsert<'ordens_servico'> = {
        cliente_id: values.cliente_id,
        tecnico_id: values.tecnico_id || null,
        problema_relatado: values.problema_relatado,
        valor_pecas: values.valor_pecas,
        valor_servicos: values.valor_servicos,
      }
      const { error } = await supabase.from('ordens_servico').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Ordem de serviço aberta.')
      queryClient.invalidateQueries({ queryKey: ['ordens_servico'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setOpen(false)
      reset()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const statusMutation = useMutation({
    mutationFn: async ({ os, status }: { os: OrdemServico; status: Status }) => {
      const { error } = await supabase
        .from('ordens_servico')
        .update({
          status,
          data_conclusao: status === 'concluida' ? new Date().toISOString() : null,
        })
        .eq('id', os.id)
      if (error) throw error
    },
    onSuccess: (_data, { status }) => {
      toast.success(
        status === 'concluida'
          ? 'OS concluída — conta a receber gerada automaticamente.'
          : 'Status atualizado.',
      )
      queryClient.invalidateQueries({ queryKey: ['ordens_servico'] })
      queryClient.invalidateQueries({ queryKey: ['contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const clienteId = watch('cliente_id')
  const tecnicoId = watch('tecnico_id')

  return (
    <div>
      <PageHeader
        title="Ordens de serviço"
        description="Ao concluir uma OS com valor, a conta a receber correspondente é criada automaticamente"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" />
              Nova OS
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nova ordem de serviço</DialogTitle>
              </DialogHeader>
              <form
                id="os-form"
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
                  <Label>Técnico</Label>
                  <Select
                    items={tecnicos?.map((t) => ({ value: t.id, label: t.nome })) ?? []}
                    value={tecnicoId}
                    onValueChange={(v) => setValue('tecnico_id', v ?? '')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem técnico definido" />
                    </SelectTrigger>
                    <SelectContent>
                      {tecnicos?.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="problema_relatado">Problema relatado</Label>
                  <Textarea id="problema_relatado" rows={3} {...register('problema_relatado')} />
                  {errors.problema_relatado && (
                    <p className="text-xs text-destructive">{errors.problema_relatado.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="valor_pecas">Valor de peças</Label>
                    <Input id="valor_pecas" type="number" step="0.01" min={0} {...register('valor_pecas')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valor_servicos">Valor de serviços</Label>
                    <Input id="valor_servicos" type="number" step="0.01" min={0} {...register('valor_servicos')} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Peças e serviços item a item entram numa próxima etapa — por ora o valor total é
                  informado direto aqui.
                </p>
              </form>
              <DialogFooter>
                <Button type="submit" form="os-form" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Salvando...' : 'Abrir OS'}
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
              <TableHead>OS</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Técnico</TableHead>
              <TableHead>Abertura</TableHead>
              <TableHead>Valor total</TableHead>
              <TableHead>Status</TableHead>
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

            {!isLoading && ordens?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhuma ordem de serviço aberta ainda.
                </TableCell>
              </TableRow>
            )}

            {ordens?.map((os) => (
              <TableRow key={os.id}>
                <TableCell className="font-medium">#{os.numero}</TableCell>
                <TableCell>{os.cliente?.nome ?? '—'}</TableCell>
                <TableCell>{os.tecnico?.nome ?? '—'}</TableCell>
                <TableCell>{formatDate(os.data_abertura)}</TableCell>
                <TableCell>{formatCurrency(os.valor_total)}</TableCell>
                <TableCell>
                  <Select
                    value={os.status}
                    onValueChange={(status) =>
                      status && statusMutation.mutate({ os, status: status as Status })
                    }
                  >
                    <SelectTrigger className="h-8 w-44">
                      <Badge variant={statusVariant[os.status]} className="pointer-events-none">
                        {statusLabel[os.status]}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(statusLabel) as Status[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {statusLabel[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
