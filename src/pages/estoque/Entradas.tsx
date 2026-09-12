import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileWarning, KeyRound, Search, Upload } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Combobox } from '@/components/campos/Combobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buscarProdutos, carregarProduto } from '@/lib/buscas'
import { mensagemErro, mensagemErroFuncao } from '@/lib/erros'
import { formatCurrency } from '@/lib/format'
import { type NFeItem, type NFeParsed, parseNFeXml } from '@/lib/nfe-xml'
import { supabase } from '@/lib/supabase'

type ItemMatch = {
  item: NFeItem
  produtoId: string // '' significa "criar novo produto"
  origemMatch: string | null
}

type SugestaoItem = {
  numero_item: string | number
  produto_id: string | null
  origem: string | null
}

const origemMatchLabel: Record<string, string> = {
  codigo_fornecedor: 'código do fornecedor',
  gtin: 'código de barras',
  descricao: 'descrição idêntica',
}

type OrigemEntrada = 'compra_xml' | 'compra_pdf' | 'compra_chave'

// 10 MB de PDF; acima disso o base64 estoura o limite de payload da Edge
// Function e o erro que volta não explica nada.
const MAX_PDF_BYTES = 10 * 1024 * 1024

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

  async function aplicarResultado(result: NFeParsed, origemMetodo: OrigemEntrada) {
    setOrigem(origemMetodo)
    setParsed(result)

    // O casamento é feito no banco: primeiro pelo de-para do fornecedor
    // (código do produto no catálogo dele), depois por GTIN e, por último,
    // descrição idêntica. O casamento por NCM que existia aqui era perigoso —
    // NCM é classificação fiscal compartilhada por dezenas de produtos.
    const { data: sugestao } = await supabase.rpc('sugerir_produtos_nfe', {
      p_payload: {
        fornecedor_cnpj: result.fornecedor_cnpj,
        itens: result.itens.map((i) => ({
          numero_item: i.numero_item,
          codigo_produto_fornecedor: i.codigo_produto_fornecedor,
          ean: i.ean,
          descricao: i.descricao,
        })),
      },
    })

    const porItem = new Map<number, { produto_id: string | null; origem: string | null }>()
    const itensSugeridos = (sugestao as { itens?: SugestaoItem[] } | null)?.itens ?? []
    for (const linha of itensSugeridos) {
      porItem.set(Number(linha.numero_item), {
        produto_id: linha.produto_id,
        origem: linha.origem,
      })
    }

    setMatches(
      result.itens.map((item) => {
        const sugerido = porItem.get(item.numero_item)
        return {
          item,
          produtoId: sugerido?.produto_id ?? '',
          origemMatch: sugerido?.origem ?? null,
        }
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

    if (file.size > MAX_PDF_BYTES) {
      setPdfError('PDF grande demais (máximo 10 MB).')
      if (pdfInputRef.current) pdfInputRef.current.value = ''
      return
    }

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

  const confirmarMutation = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error('Nenhuma NF-e carregada.')
      if (!dataVencimento) throw new Error('Informe o vencimento da conta a pagar.')

      // Tudo numa transação só no banco (fornecedor, nota, produtos, itens,
      // movimentações e conta a pagar). Antes eram ~5 requisições por item:
      // qualquer falha no meio deixava a nota "processada" com o estoque pela
      // metade e sem conta a pagar, sem como desfazer.
      const { data, error } = await supabase.rpc('registrar_entrada_nfe', {
        p_payload: {
          chave_acesso: parsed.chave_acesso,
          numero: parsed.numero,
          serie: parsed.serie,
          data_emissao: parsed.data_emissao,
          fornecedor_cnpj: parsed.fornecedor_cnpj,
          fornecedor_nome: parsed.fornecedor_nome,
          valor_total: parsed.valor_total,
          xml_original: xmlOriginal || null,
          origem_tipo: origem,
          data_vencimento: dataVencimento,
          itens: matches.map((m) => ({
            produto_id: m.produtoId || null,
            codigo_produto_fornecedor: m.item.codigo_produto_fornecedor,
            descricao: m.item.descricao,
            ncm: m.item.ncm,
            cest: m.item.cest,
            ean: m.item.ean,
            unidade: m.item.unidade,
            quantidade: m.item.quantidade,
            valor_unitario: m.item.valor_unitario,
            valor_total: m.item.valor_total,
          })),
        },
      })
      if (error) throw error
      return data as unknown as {
        produtos_criados: number
        itens: number
        vinculos_aprendidos: number
      }
    },
    onSuccess: (resumo) => {
      toast.success(
        `Entrada registrada: ${resumo.itens} item(ns)` +
          (resumo.produtos_criados > 0 ? `, ${resumo.produtos_criados} produto(s) novo(s)` : '') +
          (resumo.vinculos_aprendidos > 0
            ? `. ${resumo.vinculos_aprendidos} código(s) do fornecedor memorizado(s) para a próxima nota.`
            : '.'),
      )
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      queryClient.invalidateQueries({ queryKey: ['produtos-select-nfe'] })
      queryClient.invalidateQueries({ queryKey: ['fornecedores'] })
      queryClient.invalidateQueries({ queryKey: ['contas_pagar'] })
      queryClient.invalidateQueries({ queryKey: ['movimentacoes_estoque'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      limpar()
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
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
                      {m.produtoId && m.origemMatch && (
                        <p className="mb-1 text-[11px] text-muted-foreground">
                          casado por {origemMatchLabel[m.origemMatch] ?? m.origemMatch}
                        </p>
                      )}
                      <Combobox
                        queryKey="produtos"
                        valor={m.produtoId}
                        buscar={buscarProdutos}
                        carregarSelecionado={carregarProduto}
                        placeholder="+ Criar novo produto"
                        limparRotulo="Criar produto novo em vez de casar"
                        aoSelecionar={(v) =>
                          setMatches((prev) =>
                            prev.map((pm, i) =>
                              i === index ? { ...pm, produtoId: v, origemMatch: null } : pm,
                            ),
                          )
                        }
                      />
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
