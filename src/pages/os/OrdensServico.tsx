import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, PlayCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { ConcluirOSDialog } from '@/components/os/ConcluirOSDialog'
import { NovaSubOSDialog } from '@/components/os/NovaSubOSDialog'
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
import { useAuth } from '@/lib/auth'
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
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [osParaConcluir, setOsParaConcluir] = useState<OrdemServico | null>(null)
  const [osParaGarantia, setOsParaGarantia] = useState<OrdemServico | null>(null)

  const podeCriar = hasPermission('os.criar')
  const podeEditarTudo = hasPermission('os.editar')

  const { data: ordens, isLoading } = useQuery({
    queryKey: ['ordens_servico'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*, cliente:clientes(*), tecnico:profiles(*)')
        .order('numero', { ascending: false })
      if (error) throw error
      return data as unknown as OrdemServico[]
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
      const { error } = await supabase.from('ordens_servico').update({ status }).eq('id', os.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Status atualizado.')
      queryClient.invalidateQueries({ queryKey: ['ordens_servico'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  function mudarStatus(os: OrdemServico, status: Status) {
    if (status === 'concluida') {
      setOsParaConcluir(os)
      return
    }
    statusMutation.mutate({ os, status })
  }

  const clienteId = watch('cliente_id')
  const tecnicoId = watch('tecnico_id')

  return (
    <div>
      <PageHeader
        title="Ordens de serviço"
        description="Ao concluir uma OS com valor, a conta a receber correspondente é criada automaticamente"
        actions={
          podeCriar && (
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
          )
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
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && ordens?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhuma ordem de serviço aberta ainda.
                </TableCell>
              </TableRow>
            )}

            {ordens?.map((os) => {
              const souTecnicoResponsavel = !!user && os.tecnico_id === user.id
              const podeAgir = podeEditarTudo || souTecnicoResponsavel
              const emAndamentoOuAberta = os.status === 'aberta' || os.status === 'aguardando_peca'
              const numeroOrigem = ordens.find((o) => o.id === os.os_origem_id)?.numero

              return (
                <TableRow key={os.id}>
                  <TableCell className="font-medium">
                    #{os.numero}
                    {os.eh_garantia && (
                      <Badge variant="outline" className="ml-2 gap-1">
                        <ShieldAlert className="size-3" />
                        Garantia{numeroOrigem ? ` de #${numeroOrigem}` : ''}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{os.cliente?.nome ?? '—'}</TableCell>
                  <TableCell>{os.tecnico?.nome ?? '—'}</TableCell>
                  <TableCell>{formatDate(os.data_abertura)}</TableCell>
                  <TableCell>{formatCurrency(os.valor_total)}</TableCell>
                  <TableCell>
                    {podeEditarTudo ? (
                      <Select
                        value={os.status}
                        onValueChange={(status) => status && mudarStatus(os, status as Status)}
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
                    ) : (
                      <Badge variant={statusVariant[os.status]}>{statusLabel[os.status]}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {souTecnicoResponsavel && !podeEditarTudo && emAndamentoOuAberta && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => mudarStatus(os, 'em_andamento')}
                          disabled={statusMutation.isPending}
                        >
                          <PlayCircle className="size-3.5" />
                          Iniciar
                        </Button>
                      )}
                      {souTecnicoResponsavel && !podeEditarTudo && os.status === 'em_andamento' && (
                        <Button size="xs" onClick={() => setOsParaConcluir(os)}>
                          Concluir
                        </Button>
                      )}
                      {podeAgir && podeCriar && os.status === 'concluida' && (
                        <Button size="xs" variant="outline" onClick={() => setOsParaGarantia(os)}>
                          <ShieldAlert className="size-3.5" />
                          Sub-OS garantia
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <ConcluirOSDialog
        os={osParaConcluir ? { id: osParaConcluir.id, numero: osParaConcluir.numero } : null}
        onOpenChange={(v) => !v && setOsParaConcluir(null)}
      />

      <NovaSubOSDialog
        os={
          osParaGarantia
            ? {
                id: osParaGarantia.id,
                numero: osParaGarantia.numero,
                cliente_id: osParaGarantia.cliente_id,
                equipamento_id: osParaGarantia.equipamento_id,
              }
            : null
        }
        onOpenChange={(v) => !v && setOsParaGarantia(null)}
      />
    </div>
  )
}
