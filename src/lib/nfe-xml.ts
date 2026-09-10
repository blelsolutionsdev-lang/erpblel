// Parser de XML de NF-e (layout 4.00 da SEFAZ), 100% client-side — sem
// dependência de API externa. Lê apenas os campos que o app usa hoje.

export type NFeItem = {
  numero_item: number
  codigo_produto_fornecedor: string
  ean: string | null
  descricao: string
  ncm: string | null
  cest: string | null
  unidade: string | null
  quantidade: number
  valor_unitario: number
  valor_total: number
}

export type NFeParsed = {
  chave_acesso: string | null
  numero: string | null
  serie: string | null
  data_emissao: string | null
  fornecedor_cnpj: string | null
  fornecedor_nome: string | null
  valor_total: number | null
  itens: NFeItem[]
}

function textOf(parent: Element | Document, tag: string): string | null {
  const el = parent.getElementsByTagName(tag)[0]
  const text = el?.textContent?.trim()
  return text ? text : null
}

export function parseNFeXml(xmlText: string): NFeParsed {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')

  if (doc.getElementsByTagName('parsererror')[0]) {
    throw new Error('XML inválido ou corrompido — não foi possível ler o arquivo.')
  }

  const infNFe = doc.getElementsByTagName('infNFe')[0]
  if (!infNFe) {
    throw new Error('Esse arquivo não parece ser o XML de uma NF-e (falta o elemento infNFe).')
  }

  let chave = textOf(doc, 'chNFe')
  if (!chave) {
    const id = infNFe.getAttribute('Id') ?? ''
    chave = id.replace(/^NFe/, '') || null
  }

  const ide = infNFe.getElementsByTagName('ide')[0]
  const emit = infNFe.getElementsByTagName('emit')[0]
  const icmsTot = infNFe.getElementsByTagName('ICMSTot')[0]

  const dets = Array.from(infNFe.getElementsByTagName('det'))
  const itens: NFeItem[] = dets.map((det, index) => {
    const prod = det.getElementsByTagName('prod')[0]
    const nItemAttr = det.getAttribute('nItem')
    const ean = prod ? textOf(prod, 'cEAN') : null
    return {
      numero_item: nItemAttr ? Number(nItemAttr) : index + 1,
      codigo_produto_fornecedor: (prod && textOf(prod, 'cProd')) ?? '',
      ean: ean && ean !== 'SEM GTIN' ? ean : null,
      descricao: (prod && textOf(prod, 'xProd')) ?? `Item ${index + 1}`,
      ncm: prod ? textOf(prod, 'NCM') : null,
      cest: prod ? textOf(prod, 'CEST') : null,
      unidade: prod ? textOf(prod, 'uCom') : null,
      quantidade: prod ? Number(textOf(prod, 'qCom') ?? '0') : 0,
      valor_unitario: prod ? Number(textOf(prod, 'vUnCom') ?? '0') : 0,
      valor_total: prod ? Number(textOf(prod, 'vProd') ?? '0') : 0,
    }
  })

  if (itens.length === 0) {
    throw new Error('Nenhum item encontrado nessa NF-e.')
  }

  return {
    chave_acesso: chave,
    numero: ide ? textOf(ide, 'nNF') : null,
    serie: ide ? textOf(ide, 'serie') : null,
    data_emissao: ide ? (textOf(ide, 'dhEmi') ?? textOf(ide, 'dEmi')) : null,
    fornecedor_cnpj: emit ? textOf(emit, 'CNPJ') : null,
    fornecedor_nome: emit ? textOf(emit, 'xNome') : null,
    valor_total: icmsTot ? Number(textOf(icmsTot, 'vNF') ?? '0') : null,
    itens,
  }
}
