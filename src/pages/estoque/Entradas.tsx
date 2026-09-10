import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileWarning, KeyRound, Search, Upload } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/format'
import { type NFeItem, type NFeParsed, parseNFeXml } from '@/lib/nfe-xml'
import { supabase } from '@/lib/supabase'

type ItemMatch = {
  item: NFeItem
  produtoId: string // '' significa "criar novo produto"
}

type OrigemEntrada = 'compra_xml' | 'compra_pdf' | 'compra_chave'

const CRIAR_NOVO = '__novo__'

async function mensagemErroFuncao(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context?: Response }).context
    if (ctx instanceof Response) {
      try {
        const body = await ctx.clone().json()
        if (body?.error) return body.error as string
      } catch {
        // corpo não era JSON — ignora e cai no fallback abaixo
      }
    }
  }
  return error instanceof Error ? error.message : 'Erro inesperado.'
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function Entradas() {
  const queryClient = useQueryClient()
  const xmlInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const [parsed, setParsed] = useState<NFeParsed | null>(null)
  const [origem, setOrigem] = useState<OrigemEntrada>('compra_xml')
  const [xmlOriginal, setXmlOriginal] = useState('')
  const [matches, setMatches] = useState<ItemMatch[]>([])
  const [dataVencimento, setDataVencimento] = useState('')

  const [xmlError, setXmlError] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [chave, setChave] = useState('')
  const [chaveError, setChaveError] = useState<string | null>(null)
  const [chaveLoading, setChaveLoading] = useState(false)

  const { data: produtos } = useQuery({
    queryKey: ['produtos-select-nfe'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, ncm, codigo_barras')
        .order('nome')
      if (error) throw error
      return data
    },
    enabled: !!parsed,
  })

  const { data: unidades } = useQuery({
    queryKey: ['unidades_medida'],
    queryFn: async () => {
      const { data, error } = await supabase.from('unidades_medida').select('*').order('sigla')
      if (error) throw error
      return data
    },
    enabled: !!parsed,
  })

  async function aplicarResultado(result: NFeParsed, origemMetodo: OrigemEntrada) {
    setOrigem(origemMetodo)
    setParsed(result)

    const { data: existentes } = await supabase.from('produtos').select('id, nome, ncm, codigo_barras')

    setMatches(
      result.itens.map((item) => {
        const porCodigoBarras = item.ean ? existentes?.find((p) => p.codigo_barras === item.ean) : undefined
        const candidatosPorNcm = item.ncm ? existentes?.filter((p) => p.ncm === item.ncm) : []
        const porNcmUnico = candidatosPorNcm?.length === 1 ? candidatosPorNcm[0] : undefined
        const encontrado = porCodigoBarras ?? porNcmUnico
        return { item, produtoId: encontrado?.id ?? '' }
      }),
    )

    const dataEmissao = result.data_emissao ? new Date(result.data_emissao) : new Date()
    const vencimento = new Date(dataEmissao)
    vencimento.setDate(vencimento.getDate() + 30)
    setDataVencimento(vencimento.toISOString().slice(0, 10))
  }

  function limpar() {
    setParsed(null)
    setMatches([])
    setXmlOriginal('')
    setChave('')
  }

  async function handleXmlFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setXmlError(null)

    try {
      const text = await file.text()
      const result = parseNFeXml(text)
      setXmlOriginal(text)
      await aplicarResultado(result, 'compra_xml')
    } catch (err) {
      setXmlError(err instanceof Error ? err.message : 'Não foi possível ler o XML.')
    } finally {
      if (xmlInputRef.current) xmlInputRef.current.value = ''
    }
  }

  async function handlePdfFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfError(null)
    setPdfLoading(true)

    try {
      const pdf_base64 = await toBase64(file)
      const { data, error } = await supabase.functions.invoke('parse-danfe', { body: { pdf_base64 } })
      if (error) throw new Error(await mensagemErroFuncao(error))
      if (data?.error) throw new Error(data.error)
      setXmlOriginal('')
      await aplicarResultado(data as NFeParsed, 'compra_pdf')
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Não foi possível ler o PDF.')
    } finally {
      setPdfLoading(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  async function handleConsultarChave() {
    setChaveError(null)
    const digits = chave.replace(/\D/g, '')
    if (digits.length !== 44) {
      setChaveError('A chave de acesso tem 44 dígitos.')
      return
    }

    setChaveLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('focus-nfe-consulta', {
        body: { chave: digits },
      })
      if (error) throw new Error(await mensagemErroFuncao(error))
      if (data?.error) throw new Error(data.error)
      setXmlOriginal('')
      await aplicarResultado(data as NFeParsed, 'compra_chave')
    } catch (err) {
      setChaveError(err instanceof Error ? err.message : 'Não foi possível consultar a chave.')
    } finally {
      setChaveLoading(false)
    }
  }

  function unidadeIdPara(siglaXml: string | null) {
    if (!siglaXml) return null
    const match = unidades?.find((u) => u.sigla.toLowerCase() === siglaXml.toLowerCase())
    return match?.id ?? unidades?.find((u) => u.sigla === 'UN')?.id ?? null
  }

  const confirmarMutation = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error('Nenhuma NF-e carregada.')

      // 1) fornecedor: busca por CNPJ, cria se não existir
      let fornecedorId: string | null = null
      if (parsed.fornecedor_cnpj) {
        const { data: existente } = await supabase
          .from('fornecedores')
          .select('id')
          .eq('cpf_cnpj', parsed.fornecedor_cnpj)
          .maybeSingle()

        if (existente) {
          fornecedorId = existente.id
        } else {
          const { data: criado, error } = await supabase
            .from('fornecedores')
            .insert({
              nome: parsed.fornecedor_nome ?? 'Fornecedor sem nome',
              cpf_cnpj: parsed.fornecedor_cnpj,
              tipo_pessoa: 'PJ',
            })
            .select('id')
            .single()
          if (error) throw error
          fornecedorId = criado.id
        }
      }

      // 2) nota fiscal de entrada
      const { data: nota, error: notaError } = await supabase
        .from('notas_fiscais_entrada')
        .insert({
          chave_acesso: parsed.chave_acesso,
          numero: parsed.numero,
          serie: parsed.serie,
          fornecedor_id: fornecedorId,
          data_emissao: parsed.data_emissao,
          valor_total: parsed.valor_total,
          xml_original: xmlOriginal || null,
          status: 'processada',
          processed_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (notaError) throw notaError

      // 3) itens + produtos + movimentações de estoque
      for (const m of matches) {
        let produtoId = m.produtoId

        if (!produtoId) {
          const { data: novoProduto, error: produtoError } = await supabase
            .from('produtos')
            .insert({
              nome: m.item.descricao,
              ncm: m.item.ncm,
              cest: m.item.cest,
              codigo_barras: m.item.ean,
              unidade_id: unidadeIdPara(m.item.unidade),
              preco_custo: m.item.valor_unitario,
              preco_venda: m.item.valor_unitario,
            })
            .select('id')
            .single()
          if (produtoError) throw produtoError
          produtoId = novoProduto.id
        } else {
          await supabase.from('produtos').update({ preco_custo: m.item.valor_unitario }).eq('id', produtoId)
        }

        const { error: itemError } = await supabase.from('notas_fiscais_entrada_itens').insert({
          nota_id: nota.id,
          produto_id: produtoId,
          codigo_produto_fornecedor: m.item.codigo_produto_fornecedor,
          descricao: m.item.descricao,
          ncm: m.item.ncm,
          cest: m.item.cest,
          quantidade: m.item.quantidade,
          valor_unitario: m.item.valor_unitario,
          valor_total: m.item.valor_total,
        })
        if (itemError) throw itemError

        const { error: movError } = await supabase.from('movimentacoes_estoque').insert({
          produto_id: produtoId,
          tipo: 'entrada',
          quantidade: m.item.quantidade,
          preco_unitario: m.item.valor_unitario,
          origem_tipo: origem,
          origem_id: nota.id,
          observacao: `NF-e ${parsed.numero ?? ''} série ${parsed.serie ?? ''}`,
        })
        if (movError) throw movError
      }

      // 4) conta a pagar do fornecedor
      if (fornecedorId && parsed.valor_total) {
        const { error: contaError } = await supabase.from('contas_pagar').insert({
          fornecedor_id: fornecedorId,
          descricao: `NF-e ${parsed.numero ?? ''} série ${parsed.serie ?? ''}`,
          valor: parsed.valor_total,
          data_vencimento: dataVencimento,
          origem_tipo: origem,
          origem_id: nota.id,
        })
        if (contaError) throw contaError
      }
    },
    onSuccess: () => {
      toast.success('Entrada de estoque registrada com sucesso.')
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      queryClient.invalidateQueries({ queryKey: ['fornecedores'] })
      queryClient.invalidateQueries({ queryKey: ['contas_pagar'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      limpar()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <div>
      <PageHeader
        title="Entrada de NF-e"
        description="Dê entrada automática nos produtos e gere a conta a pagar do fornecedor a partir de uma nota de compra"
      />

      {!parsed && (
        <Tabs defaultValue="xml">
          <TabsList>
            <TabsTrigger value="xml">XML</TabsTrigger>
            <TabsTrigger value="pdf">PDF / DANFE</TabsTrigger>
            <TabsTrigger value="chave">Chave de acesso</TabsTrigger>
          </TabsList>

          <TabsContent value="xml">
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Upload className="size-8 text-muted-foreground" />
                <p className="font-medium">Selecione o arquivo XML da NF-e</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Leitura estruturada do XML autorizado pela SEFAZ — o método mais confiável.
                </p>
                <Input
                  ref={xmlInputRef}
                  type="file"
                  accept=".xml,text/xml"
                  onChange={handleXmlFile}
                  className="max-w-xs"
                />
                {xmlError && (
                  <p className="flex items-center gap-1.5 text-sm text-destructive">
                    <FileWarning className="size-4" />
                    {xmlError}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pdf">
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Upload className="size-8 text-muted-foreground" />
                <p className="font-medium">Selecione o PDF do DANFE</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Uma IA lê o PDF e extrai os dados — confira tudo na tela de revisão antes de
                  confirmar, já que PDF tem mais chance de erro de leitura do que XML.
                </p>
                <Input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handlePdfFile}
                  disabled={pdfLoading}
                  className="max-w-xs"
                />
                {pdfLoading && <p className="text-sm text-muted-foreground">Lendo o PDF...</p>}
                {pdfError && (
                  <p className="flex items-center gap-1.5 text-sm text-destructive">
                    <FileWarning className="size-4" />
                    {pdfError}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chave">
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <KeyRound className="size-8 text-muted-foreground" />
                <p className="font-medium">Digite a chave de acesso da NF-e</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Busca os dados direto na Focus NFE, sem precisar de arquivo nenhum.
                </p>
                <div className="flex w-full max-w-sm gap-2">
                  <Input
                    placeholder="44 dígitos"
                    value={chave}
                    onChange={(e) => setChave(e.target.value)}
                    maxLength={50}
                  />
                  <Button onClick={handleConsultarChave} disabled={chaveLoading}>
                    <Search className="size-4" />
                    {chaveLoading ? 'Buscando...' : 'Buscar'}
                  </Button>
                </div>
                {chaveError && (
                  <p className="flex items-center gap-1.5 text-sm text-destructive">
                    <FileWarning className="size-4" />
                    {chaveError}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {parsed && (
        <div className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 py-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Fornecedor</p>
                <p className="font-medium">{parsed.fornecedor_nome ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{parsed.fornecedor_cnpj ?? ''}</p>
              </div>
              <div>
                <p className="text-muted-foreground">NF-e</p>
                <p className="font-medium">
                  nº {parsed.numero ?? '—'} série {parsed.serie ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Valor total</p>
                <p className="font-medium">{formatCurrency(parsed.valor_total)}</p>
              </div>
              <div>
                <Label htmlFor="vencimento" className="text-muted-foreground">
                  Vencimento da conta a pagar
                </Label>
                <Input
                  id="vencimento"
                  type="date"
                  value={dataVencimento}
                  onChange={(e) => setDataVencimento(e.target.value)}
                  className="mt-1 h-8"
                />
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item da NF-e</TableHead>
                  <TableHead>NCM/CEST</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Valor unit.</TableHead>
                  <TableHead>Produto no sistema</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m, index) => (
                  <TableRow key={m.item.numero_item}>
                    <TableCell className="max-w-56 truncate">{m.item.descricao}</TableCell>
                    <TableCell className="text-sm">
                      {m.item.ncm || '—'} / {m.item.cest || '—'}
                    </TableCell>
                    <TableCell>
                      {m.item.quantidade} {m.item.unidade ?? ''}
                    </TableCell>
                    <TableCell>{formatCurrency(m.item.valor_unitario)}</TableCell>
                    <TableCell className="min-w-56">
                      <Select
                        items={[
                          { value: CRIAR_NOVO, label: '+ Criar novo produto' },
                          ...(produtos?.map((p) => ({ value: p.id, label: p.nome })) ?? []),
                        ]}
                        value={m.produtoId || CRIAR_NOVO}
                        onValueChange={(v) =>
                          setMatches((prev) =>
                            prev.map((pm, i) =>
                              i === index ? { ...pm, produtoId: v === CRIAR_NOVO ? '' : (v ?? '') } : pm,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CRIAR_NOVO}>+ Criar novo produto</SelectItem>
                          {produtos?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
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

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={limpar}>
              Cancelar
            </Button>
            <Button onClick={() => confirmarMutation.mutate()} disabled={confirmarMutation.isPending}>
              {confirmarMutation.isPending ? 'Registrando...' : 'Confirmar entrada'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
