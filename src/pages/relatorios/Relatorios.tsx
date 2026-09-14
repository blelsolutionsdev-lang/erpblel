import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Faturamento = {
  os_concluidas: number
  faturamento: number
  valor_pecas: number
  valor_servicos: number
  custo_pecas: number
  ticket_medio: number
  recebido_no_periodo: number
  pago_no_periodo: number
  por_mes: { mes: string; total: number; os: number }[]
}

type LinhaTecnico = {
  tecnico: string
  os_concluidas: number
  faturamento: number
  ticket_medio: number
  horas_medias: number
  garantias: number
}

type LinhaAbc = {
  produto: string
  quantidade: number
  valor: number
  custo: number
  margem: number
}

type Aging = Record<
  'receber' | 'pagar',
  { a_vencer: number; ate_30: number; de_31_a_60: number; acima_60: number }
>

function inicioDoAno() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
}

function Metrica({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{valor}</div>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  )
}

export function Relatorios() {
  const [de, setDe] = useState(inicioDoAno)
  const [ate, setAte] = useState(() => new Date().toISOString().slice(0, 10))

  const { data: faturamento, isLoading: carregandoFat } = useQuery({
    queryKey: ['relatorio_faturamento', de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('relatorio_faturamento', { p_de: de, p_ate: ate })
      if (error) throw error
      return data as unknown as Faturamento
    },
  })

  const { data: tecnicos } = useQuery({
    queryKey: ['relatorio_tecnicos', de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('relatorio_tecnicos', { p_de: de, p_ate: ate })
      if (error) throw error
      return data as unknown as LinhaTecnico[]
    },
  })

  const { data: abc } = useQuery({
    queryKey: ['relatorio_abc', de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('relatorio_abc_pecas', { p_de: de, p_ate: ate })
      if (error) throw error
      return data as unknown as LinhaAbc[]
    },
  })

  const { data: aging } = useQuery({
    queryKey: ['relatorio_aging'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('relatorio_contas_aging')
      if (error) throw error
      return data as unknown as Aging
    },
  })

  const margem = (faturamento?.valor_pecas ?? 0) - (faturamento?.custo_pecas ?? 0)
  const margemPercent =
    faturamento?.valor_pecas && faturamento.valor_pecas > 0
      ? ((margem / faturamento.valor_pecas) * 100).toFixed(1)
      : '0,0'

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Faturamento, margem das peças, produtividade dos técnicos e idade dos títulos"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="rel_de" className="text-xs text-muted-foreground">
            De
          </Label>
          <Input id="rel_de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rel_ate" className="text-xs text-muted-foreground">
            Até
          </Label>
          <Input id="rel_ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-8" />
        </div>
      </div>

      {carregandoFat ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metrica
            titulo="Faturamento"
            valor={formatCurrency(faturamento?.faturamento)}
            detalhe={`${faturamento?.os_concluidas ?? 0} OS concluídas`}
          />
          <Metrica
            titulo="Ticket médio"
            valor={formatCurrency(faturamento?.ticket_medio)}
            detalhe="por ordem de serviço"
          />
          <Metrica
            titulo="Margem das peças"
            valor={formatCurrency(margem)}
            detalhe={`${margemPercent}% sobre ${formatCurrency(faturamento?.valor_pecas)} vendidos`}
          />
          <Metrica
            titulo="Caixa no período"
            valor={formatCurrency(
              (faturamento?.recebido_no_periodo ?? 0) - (faturamento?.pago_no_periodo ?? 0),
            )}
            detalhe={`${formatCurrency(faturamento?.recebido_no_periodo)} recebidos · ${formatCurrency(
              faturamento?.pago_no_periodo,
            )} pagos`}
          />
        </div>
      )}

      <Tabs defaultValue="mensal" className="mt-6">
        <TabsList>
          <TabsTrigger value="mensal">Por mês</TabsTrigger>
          <TabsTrigger value="tecnicos">Técnicos</TabsTrigger>
          <TabsTrigger value="abc">Curva ABC de peças</TabsTrigger>
          <TabsTrigger value="aging">Títulos por idade</TabsTrigger>
        </TabsList>

        <TabsContent value="mensal">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">OS concluídas</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(faturamento?.por_mes ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      Nenhuma OS concluída no período.
                    </TableCell>
                  </TableRow>
                )}
                {faturamento?.por_mes?.map((linha) => (
                  <TableRow key={linha.mes}>
                    <TableCell>{linha.mes}</TableCell>
                    <TableCell className="text-right">{linha.os}</TableCell>
                    <TableCell className="text-right">{formatCurrency(linha.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="tecnicos">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Técnico</TableHead>
                  <TableHead className="text-right">OS</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Ticket médio</TableHead>
                  <TableHead className="text-right">Horas médias</TableHead>
                  <TableHead className="text-right">Garantias</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tecnicos ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Sem dados no período.
                    </TableCell>
                  </TableRow>
                )}
                {tecnicos?.map((t) => (
                  <TableRow key={t.tecnico}>
                    <TableCell className="font-medium">{t.tecnico}</TableCell>
                    <TableCell className="text-right">{t.os_concluidas}</TableCell>
                    <TableCell className="text-right">{formatCurrency(t.faturamento)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(t.ticket_medio)}</TableCell>
                    <TableCell className="text-right">{t.horas_medias}h</TableCell>
                    <TableCell className="text-right">{t.garantias}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="abc">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Peça</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(abc ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Nenhuma peça usada em OS concluída no período.
                    </TableCell>
                  </TableRow>
                )}
                {abc?.map((linha) => (
                  <TableRow key={linha.produto}>
                    <TableCell className="font-medium">{linha.produto}</TableCell>
                    <TableCell className="text-right">{linha.quantidade}</TableCell>
                    <TableCell className="text-right">{formatCurrency(linha.valor)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(linha.custo)}</TableCell>
                    <TableCell
                      className={`text-right ${linha.margem < 0 ? 'text-destructive' : 'text-emerald-600'}`}
                    >
                      {formatCurrency(linha.margem)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="aging">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faixa</TableHead>
                  <TableHead className="text-right">A receber</TableHead>
                  <TableHead className="text-right">A pagar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    ['A vencer', 'a_vencer'],
                    ['Vencido até 30 dias', 'ate_30'],
                    ['Vencido 31 a 60 dias', 'de_31_a_60'],
                    ['Vencido há mais de 60 dias', 'acima_60'],
                  ] as const
                ).map(([rotulo, chave]) => (
                  <TableRow key={chave}>
                    <TableCell>{rotulo}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(aging?.receber?.[chave])}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(aging?.pagar?.[chave])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
