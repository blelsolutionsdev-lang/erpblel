import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlarmClock,
  FileText,
  Pencil,
  PlayCircle,
  Plus,
  Printer,
  Receipt,
  Search,
  Send,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Paginacao } from '@/components/Paginacao'
import { DataTable } from '@/components/DataTable'
import { useConfirmacao } from '@/components/ConfirmDialog'
import { CampoMoeda } from '@/components/campos/CampoMoeda'
import { Combobox } from '@/components/campos/Combobox'
import { ConcluirOSDialog } from '@/components/os/ConcluirOSDialog'
import { OsAnexos } from '@/components/os/OsAnexos'
import { OsItensManager } from '@/components/os/OsItensManager'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useBuscaUrl, useFiltrosUrl } from '@/hooks/use-filtros-url'
import {
  buscarClientes,
  buscarEquipamentosDoCliente,
  buscarTecnicos,
  carregarCliente,
  carregarEquipamento,
  carregarTecnico,
} from '@/lib/buscas'
import { useAuth } from '@/lib/auth'
import { mensagemErro, mensagemErroFuncao } from '@/lib/erros'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  diasAtraso,
  garantiaVigente,
  type OsPrioridade,
  type OsStatus,
  prioridadeLabel,
  prioridadeVariant,
  statusLabel,
  statusManuais,
  statusVariant,
} from '@/lib/os'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

type OrdemServico = Tables<'ordens_servico'> & {
  cliente: Tables<'clientes'> | null
  tecnico: Tables<'profiles'> | null
  equipamento: Tables<'equipamentos'> | null
}

const formSchema = z.object({
  cliente_id: z.string().min(1, 'Selecione um cliente'),
  equipamento_id: z.string().optional(),
  tecnico_id: z.string().optional(),
  problema_relatado: z.string().min(2, 'Descreva o problema relatado'),
  prioridade: z.enum(['baixa', 'normal', 'alta', 'urgente']),
  data_prevista: z.string().optional(),
  garantia_dias: z.coerce.number().int().min(0),
  valor_acrescimo: z.coerce.number().min(0),
  valor_desconto: z.coerce.number().min(0),
})

type FormValues = z.infer<typeof formSchema>

const emptyValues: FormValues = {
  cliente_id: '',
  equipamento_id: '',
  tecnico_id: '',
  problema_relatado: '',
  prioridade: 'normal',
  data_prevista: '',
  garantia_dias: 90,
  valor_acrescimo: 0,
  valor_desconto: 0,
}

export function OrdensServico() {
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [osParaConcluir, setOsParaConcluir] = useState<OrdemServico | null>(null)
  const [osParaGarantia, setOsParaGarantia] = useState<OrdemServico | null>(null)
  const [problemaGarantia, setProblemaGarantia] = useState('')
  const [osParaAprovar, setOsParaAprovar] = useState<OrdemServico | null>(null)
  const [aprovadoPor, setAprovadoPor] = useState('')
  const [osParaReprovar, setOsParaReprovar] = useState<OrdemServico | null>(null)
  const [motivoReprovacao, setMotivoReprovacao] = useState('')
  const { pedirConfirmacao, dialogoConfirmacao } = useConfirmacao()
  const { filtros, definir, pagina, setPagina, de, ate } = useFiltrosUrl({ q: '', status: '' })
  const { texto: busca, setTexto: setBusca } = useBuscaUrl(filtros.q, (q) => definir({ q }))
  const filtroStatus = filtros.status as '' | OsStatus

  const podeCriar = hasPermission('os.criar')
  const podeEditarTudo = hasPermission('os.editar')
  const podeEmitirNota = hasPermission('fiscal.gerenciar')

  const {
    data: resultado,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['ordens_servico', filtros.q, filtroStatus, pagina],
    queryFn: async () => {
      const termo = filtros.q.trim()
      const soNumeros = /^\d+$/.test(termo)

      let query = supabase
        .from('ordens_servico')
        .select(
          termo && !soNumeros
            ? '*, cliente:clientes!inner(*), tecnico:profiles(*), equipamento:equipamentos(*)'
            : '*, cliente:clientes(*), tecnico:profiles(*), equipamento:equipamentos(*)',
          { count: 'exact' },
        )
        .order('numero', { ascending: false })
        .range(de, ate)

      if (termo) {
        query = soNumeros
          ? query.eq('numero', Number(termo))
          : query.ilike('cliente.nome', `%${termo}%`)
      }
      if (filtroStatus) query = query.eq('status', filtroStatus)

      const { data, error, count } = await query
      if (error) throw error
      return { linhas: data as unknown as OrdemServico[], total: count }
    },
  })

  const ordens = resultado?.linhas

  const { data: editing } = useQuery({
    queryKey: ['ordem_servico', editingId],
    enabled: !!editingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*, cliente:clientes(*), tecnico:profiles(*), equipamento:equipamentos(*)')
        .eq('id', editingId!)
        .single()
      if (error) throw error
      return data as unknown as OrdemServico
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
    defaultValues: emptyValues,
  })

  const clienteId = watch('cliente_id')

  useEffect(() => {
    if (open && editing) {
      reset({
        cliente_id: editing.cliente_id,
        equipamento_id: editing.equipamento_id ?? '',
        tecnico_id: editing.tecnico_id ?? '',
        problema_relatado: editing.problema_relatado ?? '',
        prioridade: editing.prioridade,
        data_prevista: editing.data_prevista ?? '',
        garantia_dias: editing.garantia_dias,
        valor_acrescimo: editing.valor_acrescimo,
        valor_desconto: editing.valor_desconto,
      })
    } else if (open && !editingId) {
      reset(emptyValues)
    }
    // Propositalmente não depende de `editing` inteiro: um refetch disparado
    // pela adição de itens não deve resetar campos sendo digitados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId, editing?.id])

  function invalidarOS(id?: string) {
    queryClient.invalidateQueries({ queryKey: ['ordens_servico'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    if (id) queryClient.invalidateQueries({ queryKey: ['ordem_servico', id] })
  }

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: TablesInsert<'ordens_servico'> = {
        cliente_id: values.cliente_id,
        equipamento_id: values.equipamento_id || null,
        tecnico_id: values.tecnico_id || null,
        problema_relatado: values.problema_relatado,
        prioridade: values.prioridade,
        data_prevista: values.data_prevista || null,
        garantia_dias: values.garantia_dias,
        valor_acrescimo: values.valor_acrescimo,
        valor_desconto: values.valor_desconto,
      }

      if (editingId) {
        const { error } = await supabase.from('ordens_servico').update(payload).eq('id', editingId)
        if (error) throw error
        return editingId
      }

      const { data, error } = await supabase.from('ordens_servico').insert(payload).select('id').single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (id) => {
      toast.success(editingId ? 'OS atualizada.' : 'OS aberta — agora é só adicionar produtos e serviços.')
      invalidarOS(id)
      setEditingId(id)
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const statusMutation = useMutation({
    mutationFn: async ({ os, status }: { os: OrdemServico; status: OsStatus }) => {
      const { error } = await supabase.from('ordens_servico').update({ status }).eq('id', os.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Status atualizado.')
      invalidarOS()
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const orcamentoMutation = useMutation({
    mutationFn: async (os: OrdemServico) => {
      const { error } = await supabase.rpc('enviar_orcamento_os', { p_os_id: os.id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Orçamento enviado — a OS fica travada até o cliente aprovar.')
      invalidarOS()
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const aprovarMutation = useMutation({
    mutationFn: async () => {
      if (!osParaAprovar) throw new Error('OS inválida.')
      const { error } = await supabase.rpc('aprovar_orcamento_os', {
        p_os_id: osParaAprovar.id,
        p_aprovado_por: aprovadoPor.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Orçamento aprovado — OS liberada para execução.')
      invalidarOS(osParaAprovar?.id)
      setOsParaAprovar(null)
      setAprovadoPor('')
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const reprovarMutation = useMutation({
    mutationFn: async () => {
      if (!osParaReprovar) throw new Error('OS inválida.')
      const { error } = await supabase.rpc('reprovar_orcamento_os', {
        p_os_id: osParaReprovar.id,
        p_motivo: motivoReprovacao,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Orçamento reprovado.')
      invalidarOS(osParaReprovar?.id)
      setOsParaReprovar(null)
      setMotivoReprovacao('')
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const garantiaMutation = useMutation({
    mutationFn: async () => {
      if (!osParaGarantia) throw new Error('OS inválida.')
      const { error } = await supabase.rpc('abrir_sub_os_garantia', {
        p_os_id: osParaGarantia.id,
        p_problema: problemaGarantia,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Sub-OS de garantia aberta.')
      invalidarOS()
      setOsParaGarantia(null)
      setProblemaGarantia('')
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const nfceMutation = useMutation({
    mutationFn: async (os: OrdemServico) => {
      const { data, error } = await supabase.functions.invoke('focus-nfe-emitir', {
        body: { os_id: os.id },
      })
      if (error) throw new Error(await mensagemErroFuncao(error))
      if (data?.error) throw new Error(data.error)
      return data as { status: string; chave?: string | null; mensagem?: string }
    },
    onSuccess: (data) => {
      toast.success(
        data.status === 'autorizada'
          ? `NFC-e autorizada${data.chave ? ` — chave ${data.chave}` : ''}.`
          : `NFC-e enviada (status: ${data.status}).`,
      )
      queryClient.invalidateQueries({ queryKey: ['notas_fiscais_saida'] })
      invalidarOS()
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  function mudarStatus(os: OrdemServico, status: OsStatus) {
    if (status === 'concluida') {
      setOsParaConcluir(os)
      return
    }

    // Cancelar era um item qualquer do seletor, mas desfaz a OS inteira:
    // devolve as peças ao estoque e cancela o título gerado.
    if (status === 'cancelada') {
      pedirConfirmacao({
        titulo: `Cancelar a OS #${os.numero}?`,
        destrutivo: true,
        rotuloConfirmar: 'Cancelar OS',
        descricao:
          os.status === 'concluida'
            ? 'As peças baixadas voltam para o estoque e a conta a receber é cancelada (se ainda não houver recebimento).'
            : 'A OS sai do fluxo de trabalho. Dá para reabrir depois mudando o status.',
        aoConfirmar: () => statusMutation.mutateAsync({ os, status }),
      })
      return
    }

    statusMutation.mutate({ os, status })
  }

  function abrirNova() {
    setEditingId(null)
    setOpen(true)
  }

  function abrirEdicao(os: OrdemServico) {
    setEditingId(os.id)
    setOpen(true)
  }

  const equipamentoId = watch('equipamento_id')
  const tecnicoId = watch('tecnico_id')
  const prioridade = watch('prioridade')
  const acrescimo = Number(watch('valor_acrescimo')) || 0
  const desconto = Number(watch('valor_desconto')) || 0
  const totalPreview = (editing?.valor_pecas ?? 0) + (editing?.valor_servicos ?? 0) + acrescimo - desconto

  const osAberta = editing && editing.status !== 'concluida' && editing.status !== 'cancelada' && editing.status !== 'reprovada'
  const souTecnicoDaOsEditada = !!user && editing?.tecnico_id === user.id
  const podeMexerNaOsEditada = podeEditarTudo || souTecnicoDaOsEditada
  const podeEditarCabecalho = !editingId || podeEditarTudo
  // Orçamento enviado congela os itens: mudar valor depois do cliente aprovar
  // (ou enquanto ele decide) é exatamente o que a aprovação existe para evitar.
  const itensEditaveis = !!osAberta && podeMexerNaOsEditada && editing?.status !== 'orcamento'

  return (
    <div>
      {dialogoConfirmacao}
      <PageHeader
        title="Ordens de serviço"
        description="Orçamento, execução, garantia e faturamento — com peças e serviços baixando estoque na conclusão"
        actions={
          podeCriar && (
            <Button onClick={abrirNova}>
              <Plus className="size-4" />
              Nova OS
            </Button>
          )
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número da OS ou cliente..."
            className="pl-8"
          />
        </div>
        <Select
          items={[
            { value: 'todos', label: 'Todos os status' },
            ...(Object.keys(statusLabel) as OsStatus[]).map((st) => ({
              value: st,
              label: statusLabel[st],
            })),
          ]}
          value={filtroStatus || 'todos'}
          onValueChange={(v) => definir({ status: !v || v === 'todos' ? '' : v })}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {(Object.keys(statusLabel) as OsStatus[]).map((st) => (
              <SelectItem key={st} value={st}>
                {statusLabel[st]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        linhas={ordens}
        carregando={isLoading}
        chave={(os) => os.id}
        vazio={
          filtros.q || filtroStatus
            ? 'Nenhuma OS encontrada com esses filtros.'
            : 'Nenhuma ordem de serviço aberta ainda.'
        }
        colunas={[
          {
            titulo: 'OS',
            mobile: 'titulo',
            celula: (os) => (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">#{os.numero}</span>
                <Badge variant={prioridadeVariant[os.prioridade]} className="text-[10px]">
                  {prioridadeLabel[os.prioridade]}
                </Badge>
                {os.eh_garantia && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <ShieldAlert className="size-3" />
                    Garantia
                  </Badge>
                )}
                <Badge variant={statusVariant[os.status]}>{statusLabel[os.status]}</Badge>
              </div>
            ),
          },
          {
            titulo: 'Cliente / equipamento',
            celula: (os) => (
              <div>
                <div>{os.cliente?.nome ?? '\u2014'}</div>
                <div className="text-xs text-muted-foreground">
                  {os.equipamento
                    ? [os.equipamento.tipo, os.equipamento.marca, os.equipamento.modelo]
                        .filter(Boolean)
                        .join(' \u00b7 ') || 'Equipamento'
                    : 'Sem equipamento'}
                </div>
              </div>
            ),
          },
          { titulo: 'Técnico', celula: (os) => os.tecnico?.nome ?? '\u2014' },
          {
            titulo: 'Prazo',
            celula: (os) => {
              const atraso = diasAtraso(os.data_prevista, os.status)
              const emGarantia = garantiaVigente(os.garantia_ate)
              return (
                <div>
                  <div className="text-sm">
                    {os.data_prevista ? formatDate(os.data_prevista) : '\u2014'}
                  </div>
                  {atraso > 0 && (
                    <Badge variant="destructive" className="gap-1 text-[10px]">
                      <AlarmClock className="size-3" />
                      {atraso}d de atraso
                    </Badge>
                  )}
                  {os.status === 'concluida' && os.garantia_ate && (
                    <div className="text-[11px] text-muted-foreground">
                      Garantia {emGarantia ? 'até' : 'venceu em'} {formatDate(os.garantia_ate)}
                    </div>
                  )}
                </div>
              )
            },
          },
          {
            titulo: 'Valor total',
            alinhar: 'direita',
            celula: (os) => formatCurrency(os.valor_total),
          },
          {
            titulo: 'Mudar status',
            mobile: 'oculta',
            celula: (os) =>
              podeEditarTudo && os.status !== 'orcamento' ? (
                <Select
                  value={os.status}
                  onValueChange={(status) => status && mudarStatus(os, status as OsStatus)}
                >
                  <SelectTrigger className="h-8 w-44" aria-label={`Status da OS ${os.numero}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusManuais.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabel[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null,
          },
        ]}
        acoes={(os) => {
          const souTecnicoResponsavel = !!user && os.tecnico_id === user.id
          const podeAgir = podeEditarTudo || souTecnicoResponsavel

          return (
            <>
              {podeAgir && (
                <Button size="xs" variant="outline" onClick={() => abrirEdicao(os)}>
                  <Pencil className="size-3.5" />
                  Itens
                </Button>
              )}

              {podeAgir && ['aberta', 'aguardando_peca', 'reprovada'].includes(os.status) && (
                <Button
                  size="xs"
                  variant="outline"
                  title="Enviar orçamento para aprovação do cliente"
                  onClick={() => orcamentoMutation.mutate(os)}
                  disabled={orcamentoMutation.isPending}
                >
                  <Send className="size-3.5" />
                  Orçar
                </Button>
              )}

              {podeAgir && os.status === 'orcamento' && (
                <>
                  <Button
                    size="xs"
                    onClick={() => {
                      setOsParaAprovar(os)
                      setAprovadoPor(os.cliente?.nome ?? '')
                    }}
                  >
                    <ThumbsUp className="size-3.5" />
                    Aprovar
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setOsParaReprovar(os)}>
                    <ThumbsDown className="size-3.5" />
                    Reprovar
                  </Button>
                </>
              )}

              {souTecnicoResponsavel && !podeEditarTudo && os.status === 'aberta' && (
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

              <Button
                size="xs"
                variant="ghost"
                title="Imprimir OS"
                onClick={() => window.open(`/os/${os.id}/imprimir`, '_blank')}
              >
                <Printer className="size-3.5" />
              </Button>

              {podeAgir && podeCriar && os.status === 'concluida' && (
                <Button size="xs" variant="outline" onClick={() => setOsParaGarantia(os)}>
                  <ShieldAlert className="size-3.5" />
                  Garantia
                </Button>
              )}

              {podeEmitirNota && os.status === 'concluida' && (
                <Button
                  size="xs"
                  variant="outline"
                  title="Emitir NFC-e desta OS"
                  onClick={() => nfceMutation.mutate(os)}
                  disabled={nfceMutation.isPending}
                >
                  <Receipt className="size-3.5" />
                  NFC-e
                </Button>
              )}

              {/* No celular a coluna de status some: o cancelamento fica aqui. */}
              {podeEditarTudo && os.status !== 'orcamento' && os.status !== 'cancelada' && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="md:hidden"
                  onClick={() => mudarStatus(os, 'cancelada')}
                >
                  Cancelar OS
                </Button>
              )}
            </>
          )
        }}
      />


      <Paginacao
        pagina={pagina}
        setPagina={setPagina}
        total={resultado?.total}
        carregando={isFetching}
      />

      {/* O diálogo fica fora do PageHeader: antes ele só era montado junto com o
          botão "Nova OS", então quem tinha os.editar (ou era o técnico da OS)
          mas não tinha os.criar clicava em "Itens" e nada acontecia. */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setEditingId(null)
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? `Editar OS #${editing.numero}` : 'Nova ordem de serviço'}
              {editing && <Badge variant={statusVariant[editing.status]}>{statusLabel[editing.status]}</Badge>}
            </DialogTitle>
          </DialogHeader>

          {editing?.status === 'orcamento' && (
            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              Orçamento enviado em {formatDate(editing.orcamento_enviado_em)}. Os itens ficam
              travados até o cliente aprovar ou reprovar.
            </p>
          )}
          {editing?.status === 'reprovada' && editing.motivo_reprovacao && (
            <p className="rounded-md border border-dashed p-2 text-xs text-destructive">
              Reprovado: {editing.motivo_reprovacao}
            </p>
          )}
          {editing?.aprovado_por && (
            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              Aprovado por {editing.aprovado_por} em {formatDate(editing.aprovado_em)}.
            </p>
          )}

          <form
            id="os-form"
            className="space-y-4"
            onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="os_cliente">Cliente</Label>
                <Combobox
                  id="os_cliente"
                  queryKey="clientes"
                  valor={clienteId}
                  buscar={buscarClientes}
                  carregarSelecionado={carregarCliente}
                  placeholder="Busque pelo nome ou CNPJ"
                  disabled={!podeEditarCabecalho}
                  aoSelecionar={(v) => {
                    setValue('cliente_id', v)
                    setValue('equipamento_id', '')
                  }}
                />
                {errors.cliente_id && (
                  <p className="text-xs text-destructive">{errors.cliente_id.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="os_equipamento">Equipamento</Label>
                <Combobox
                  id="os_equipamento"
                  queryKey={`equipamentos-${clienteId || 'sem-cliente'}`}
                  valor={equipamentoId ?? ''}
                  buscar={buscarEquipamentosDoCliente(clienteId)}
                  carregarSelecionado={carregarEquipamento}
                  placeholder={clienteId ? 'Selecione' : 'Escolha o cliente antes'}
                  vazio="Nenhum equipamento cadastrado para este cliente."
                  disabled={!podeEditarCabecalho || !clienteId}
                  aoSelecionar={(v) => setValue('equipamento_id', v)}
                />
                <p className="text-xs text-muted-foreground">
                  Cadastre os equipamentos na ficha do cliente.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="os_tecnico">Técnico responsável</Label>
                <Combobox
                  id="os_tecnico"
                  queryKey="tecnicos"
                  valor={tecnicoId ?? ''}
                  buscar={buscarTecnicos}
                  carregarSelecionado={carregarTecnico}
                  placeholder="Sem técnico"
                  disabled={!podeEditarCabecalho}
                  aoSelecionar={(v) => setValue('tecnico_id', v)}
                />
              </div>

              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select
                  items={(Object.keys(prioridadeLabel) as OsPrioridade[]).map((pr) => ({
                    value: pr,
                    label: prioridadeLabel[pr],
                  }))}
                  value={prioridade}
                  onValueChange={(v) => setValue('prioridade', (v ?? 'normal') as OsPrioridade)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(prioridadeLabel) as OsPrioridade[]).map((pr) => (
                      <SelectItem key={pr} value={pr}>
                        {prioridadeLabel[pr]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="data_prevista">Previsão de entrega</Label>
                <Input id="data_prevista" type="date" {...register('data_prevista')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="problema_relatado">Problema relatado</Label>
              <Textarea
                id="problema_relatado"
                rows={3}
                disabled={!podeEditarCabecalho}
                {...register('problema_relatado')}
              />
              {errors.problema_relatado && (
                <p className="text-xs text-destructive">{errors.problema_relatado.message}</p>
              )}
            </div>
          </form>

          {editing ? (
            <OsItensManager osId={editing.id} editavel={itensEditaveis} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Salve a OS primeiro para poder adicionar produtos, kits e serviços.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="valor_acrescimo">Acréscimo</Label>
              <CampoMoeda id="valor_acrescimo" control={control} name="valor_acrescimo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor_desconto">Desconto</Label>
              <CampoMoeda id="valor_desconto" control={control} name="valor_desconto" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="garantia_dias">Garantia (dias)</Label>
              <Input
                id="garantia_dias"
                type="number"
                min={0}
                form="os-form"
                {...register('garantia_dias')}
              />
            </div>
          </div>

          {editing && (
            <div className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Produtos/peças</span>
                <span>{formatCurrency(editing.valor_pecas)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Serviços</span>
                <span>{formatCurrency(editing.valor_servicos)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Acréscimo</span>
                <span>+ {formatCurrency(acrescimo)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Desconto</span>
                <span>- {formatCurrency(desconto)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5 font-medium">
                <span>Total</span>
                <span>{formatCurrency(totalPreview)}</span>
              </div>
            </div>
          )}

          {editing?.status === 'concluida' && (
            <OsAnexos osId={editing.id} assinanteNome={editing.assinatura_cliente_nome} />
          )}

          <DialogFooter className="gap-2">
            {editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(`/os/${editing.id}/imprimir`, '_blank')}
              >
                <FileText className="size-4" />
                Imprimir
              </Button>
            )}
            <Button type="submit" form="os-form" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar' : 'Abrir OS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConcluirOSDialog
        os={osParaConcluir ? { id: osParaConcluir.id, numero: osParaConcluir.numero } : null}
        onOpenChange={(v) => !v && setOsParaConcluir(null)}
      />

      <Dialog open={!!osParaAprovar} onOpenChange={(v) => !v && setOsParaAprovar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar orçamento da OS #{osParaAprovar?.numero}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Valor aprovado: <strong>{formatCurrency(osParaAprovar?.valor_total)}</strong>
            </p>
            <div className="space-y-2">
              <Label htmlFor="aprovado_por">Quem aprovou</Label>
              <Input
                id="aprovado_por"
                value={aprovadoPor}
                onChange={(e) => setAprovadoPor(e.target.value)}
                placeholder="Nome de quem autorizou o serviço"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => aprovarMutation.mutate()} disabled={aprovarMutation.isPending}>
              {aprovarMutation.isPending ? 'Aprovando...' : 'Aprovar e liberar execução'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!osParaReprovar} onOpenChange={(v) => !v && setOsParaReprovar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reprovar orçamento da OS #{osParaReprovar?.numero}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo_reprovacao">Motivo</Label>
            <Textarea
              id="motivo_reprovacao"
              rows={3}
              value={motivoReprovacao}
              onChange={(e) => setMotivoReprovacao(e.target.value)}
              placeholder="Preço, prazo, cliente desistiu..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => reprovarMutation.mutate()}
              disabled={reprovarMutation.isPending}
            >
              {reprovarMutation.isPending ? 'Reprovando...' : 'Reprovar orçamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!osParaGarantia} onOpenChange={(v) => !v && setOsParaGarantia(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Retorno em garantia (origem #{osParaGarantia?.numero})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="problema-garantia">Problema relatado</Label>
            <Textarea
              id="problema-garantia"
              rows={3}
              value={problemaGarantia}
              onChange={(e) => setProblemaGarantia(e.target.value)}
              placeholder="O que motivou o retorno em garantia..."
            />
            <p className="text-xs text-muted-foreground">
              Herda cliente, equipamento e técnico da OS de origem. O banco recusa se o prazo de
              garantia já tiver vencido
              {osParaGarantia?.garantia_ate
                ? ` (vence em ${formatDate(osParaGarantia.garantia_ate)})`
                : ''}
              .
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => garantiaMutation.mutate()} disabled={garantiaMutation.isPending}>
              {garantiaMutation.isPending ? 'Abrindo...' : 'Abrir sub-OS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
