import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { mensagemErro, mensagemErroFuncao } from '@/lib/erros'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Enums, Tables } from '@/types/database'

type Nota = Tables<'notas_fiscais_saida'> & {
  cliente: Pick<Tables<'clientes'>, 'id' | 'nome'> | null
  os: Pick<Tables<'ordens_servico'>, 'id' | 'numero'> | null
}

const schema = z.object({
  ambiente: z.enum(['homologacao', 'producao']),
  razao_social: z.string().min(2, 'Informe a razão social'),
  nome_fantasia: z.string().optional(),
  cnpj: z.string().min(14, 'Informe o CNPJ'),
  inscricao_estadual: z.string().optional(),
  regime_tributario: z.coerce.number().int().min(1).max(3),
  serie: z.string().min(1),
  proximo_numero: z.coerce.number().int().min(1),
  cfop_padrao: z.string().min(4),
  csosn_padrao: z.string().min(2),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  municipio: z.string().optional(),
  codigo_municipio: z.string().optional(),
  uf: z.string().optional(),
  cep: z.string().optional(),
  telefone: z.string().optional(),
  ativo: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const statusVariant: Record<Enums<'nfce_status'>, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pendente: 'secondary',
  autorizada: 'default',
  cancelada: 'outline',
  erro: 'destructive',
  rejeitada: 'destructive',
}

export function Fiscal() {
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['configuracoes_fiscais'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracoes_fiscais')
        .select('*')
        .order('created_at')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Tables<'configuracoes_fiscais'> | null
    },
  })

  const { data: notas } = useQuery({
    queryKey: ['notas_fiscais_saida'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notas_fiscais_saida')
        .select('*, cliente:clientes(id, nome), os:ordens_servico(id, numero)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as Nota[]
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
    resolver: zodResolver(schema),
    defaultValues: {
      ambiente: 'homologacao',
      razao_social: '',
      nome_fantasia: '',
      cnpj: '',
      inscricao_estadual: '',
      regime_tributario: 1,
      serie: '1',
      proximo_numero: 1,
      cfop_padrao: '5102',
      csosn_padrao: '102',
      logradouro: '',
      numero: '',
      bairro: '',
      municipio: '',
      codigo_municipio: '',
      uf: '',
      cep: '',
      telefone: '',
      ativo: true,
    },
  })

  useEffect(() => {
    if (config) {
      reset({
        ambiente: config.ambiente,
        razao_social: config.razao_social ?? '',
        nome_fantasia: config.nome_fantasia ?? '',
        cnpj: config.cnpj ?? '',
        inscricao_estadual: config.inscricao_estadual ?? '',
        regime_tributario: config.regime_tributario,
        serie: config.serie,
        proximo_numero: Number(config.proximo_numero),
        cfop_padrao: config.cfop_padrao,
        csosn_padrao: config.csosn_padrao,
        logradouro: config.logradouro ?? '',
        numero: config.numero ?? '',
        bairro: config.bairro ?? '',
        municipio: config.municipio ?? '',
        codigo_municipio: config.codigo_municipio ?? '',
        uf: config.uf ?? '',
        cep: config.cep ?? '',
        telefone: config.telefone ?? '',
        ativo: config.ativo,
      })
    }
  }, [config, reset])

  const salvarMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        ...values,
        nome_fantasia: values.nome_fantasia || null,
        inscricao_estadual: values.inscricao_estadual || null,
        logradouro: values.logradouro || null,
        numero: values.numero || null,
        bairro: values.bairro || null,
        municipio: values.municipio || null,
        codigo_municipio: values.codigo_municipio || null,
        uf: values.uf || null,
        cep: values.cep || null,
        telefone: values.telefone || null,
      }

      if (config) {
        const { error } = await supabase.from('configuracoes_fiscais').update(payload).eq('id', config.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('configuracoes_fiscais').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Configuração fiscal salva.')
      queryClient.invalidateQueries({ queryKey: ['configuracoes_fiscais'] })
      queryClient.invalidateQueries({ queryKey: ['configuracoes_fiscais_publicas'] })
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const consultarMutation = useMutation({
    mutationFn: async (nota: Nota) => {
      const { data, error } = await supabase.functions.invoke('focus-nfe-emitir', {
        body: { nota_id: nota.id, apenas_consultar: true },
      })
      if (error) throw new Error(await mensagemErroFuncao(error))
      if (data?.error) throw new Error(data.error)
      return data as { status: string }
    },
    onSuccess: (data) => {
      toast.success(`Status atualizado: ${data.status}`)
      queryClient.invalidateQueries({ queryKey: ['notas_fiscais_saida'] })
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const ambiente = watch('ambiente')
  const regime = watch('regime_tributario')

  return (
    <div>
      <PageHeader
        title="Fiscal — NFC-e"
        description="Dados da empresa emitente e notas geradas a partir das ordens de serviço concluídas"
      />

      <Tabs defaultValue="notas">
        <TabsList>
          <TabsTrigger value="notas">Notas emitidas</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="notas">
          {!config?.ativo && (
            <Card className="mb-3">
              <CardContent className="py-4 text-sm text-muted-foreground">
                A emissão está desligada. Preencha a aba <strong>Configuração</strong>, marque como
                ativa e cadastre o secret <code>FOCUS_NFE_TOKEN</code> no projeto Supabase.
              </CardContent>
            </Card>
          )}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nota</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(notas ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Nenhuma NFC-e emitida ainda. Emita pela tela de Ordens de serviço, numa OS
                      concluída.
                    </TableCell>
                  </TableRow>
                )}
                {notas?.map((nota) => (
                  <TableRow key={nota.id}>
                    <TableCell className="font-medium">
                      {nota.numero ? `nº ${nota.numero}` : '—'}
                      <div className="text-xs text-muted-foreground">
                        série {nota.serie ?? '—'} · {nota.ambiente}
                      </div>
                    </TableCell>
                    <TableCell>{nota.os ? `#${nota.os.numero}` : '—'}</TableCell>
                    <TableCell>{nota.cliente?.nome ?? '—'}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(nota.created_at)}</TableCell>
                    <TableCell>{formatCurrency(nota.valor_total)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[nota.status]}>{nota.status}</Badge>
                      {nota.erro_mensagem && (
                        <div className="max-w-56 truncate text-xs text-destructive" title={nota.erro_mensagem}>
                          {nota.erro_mensagem}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {nota.status === 'pendente' && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => consultarMutation.mutate(nota)}
                            disabled={consultarMutation.isPending}
                          >
                            <RefreshCw className="size-3.5" />
                            Consultar
                          </Button>
                        )}
                        {nota.danfe_url && (
                          <Button size="xs" variant="outline" onClick={() => window.open(nota.danfe_url!, '_blank')}>
                            DANFE
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="config">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <form
              className="max-w-3xl space-y-4"
              onSubmit={handleSubmit((values) => salvarMutation.mutate(values))}
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ambiente</Label>
                  <Select
                    items={[
                      { value: 'homologacao', label: 'Homologação (teste)' },
                      { value: 'producao', label: 'Produção (vale como nota)' },
                    ]}
                    value={ambiente}
                    onValueChange={(v) => setValue('ambiente', (v ?? 'homologacao') as 'homologacao' | 'producao')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="homologacao">Homologação (teste)</SelectItem>
                      <SelectItem value="producao">Produção (vale como nota)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Regime tributário</Label>
                  <Select
                    items={[
                      { value: '1', label: '1 — Simples Nacional' },
                      { value: '2', label: '2 — Simples, excesso de sublimite' },
                      { value: '3', label: '3 — Regime normal' },
                    ]}
                    value={String(regime)}
                    onValueChange={(v) => setValue('regime_tributario', Number(v ?? 1))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Simples Nacional</SelectItem>
                      <SelectItem value="2">2 — Simples, excesso de sublimite</SelectItem>
                      <SelectItem value="3">3 — Regime normal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="razao_social">Razão social</Label>
                  <Input id="razao_social" {...register('razao_social')} />
                  {errors.razao_social && (
                    <p className="text-xs text-destructive">{errors.razao_social.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nome_fantasia">Nome fantasia</Label>
                  <Input id="nome_fantasia" {...register('nome_fantasia')} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input id="cnpj" {...register('cnpj')} />
                  {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inscricao_estadual">Inscrição estadual</Label>
                  <Input id="inscricao_estadual" {...register('inscricao_estadual')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input id="telefone" {...register('telefone')} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="serie">Série</Label>
                  <Input id="serie" {...register('serie')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proximo_numero">Próximo número</Label>
                  <Input id="proximo_numero" type="number" min={1} {...register('proximo_numero')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfop_padrao">CFOP padrão</Label>
                  <Input id="cfop_padrao" {...register('cfop_padrao')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="csosn_padrao">CSOSN/CST padrão</Label>
                  <Input id="csosn_padrao" {...register('csosn_padrao')} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="logradouro">Logradouro</Label>
                  <Input id="logradouro" {...register('logradouro')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero">Número</Label>
                  <Input id="numero" {...register('numero')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input id="bairro" {...register('bairro')} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="municipio">Município</Label>
                  <Input id="municipio" {...register('municipio')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="codigo_municipio">Código IBGE</Label>
                  <Input id="codigo_municipio" {...register('codigo_municipio')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uf">UF</Label>
                  <Input id="uf" maxLength={2} {...register('uf')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input id="cep" {...register('cep')} />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={watch('ativo')}
                  onChange={(e) => setValue('ativo', e.target.checked)}
                />
                Emissão ativa
              </label>

              <Button type="submit" disabled={salvarMutation.isPending}>
                {salvarMutation.isPending ? 'Salvando...' : 'Salvar configuração'}
              </Button>
            </form>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
