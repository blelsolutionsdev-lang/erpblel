import { describe, expect, it } from 'vitest'
import { parseNFeXml } from '@/lib/nfe-xml'

/**
 * XML no formato que o contador/fornecedor entrega: nfeProc (nota já
 * autorizada), com o namespace padrão da SEFAZ e o protocolo junto.
 */
const NFE_AUTORIZADA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe versao="4.00" Id="NFe35240612345678000199550010000123451000123456">
      <ide>
        <cUF>35</cUF>
        <nNF>12345</nNF>
        <serie>1</serie>
        <dhEmi>2026-09-01T10:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>DISTRIBUIDORA REFRIGERACAO LTDA</xNome>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>COMP-14</cProd>
          <cEAN>7891234567895</cEAN>
          <xProd>COMPRESSOR 1/4 HP 220V</xProd>
          <NCM>84143011</NCM>
          <CEST>2104700</CEST>
          <uCom>UN</uCom>
          <qCom>10.0000</qCom>
          <vUnCom>275.5000000000</vUnCom>
          <vProd>2755.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>GAS-R410</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>GAS REFRIGERANTE R410A CILINDRO 11,3KG</xProd>
          <NCM>29037900</NCM>
          <uCom>CX</uCom>
          <qCom>4.0000</qCom>
          <vUnCom>410.0000000000</vUnCom>
          <vProd>1640.00</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vProd>4395.00</vProd>
          <vNF>4395.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <chNFe>35240612345678000199550010000123451000123456</chNFe>
      <nProt>135240000123456</nProt>
    </infProt>
  </protNFe>
</nfeProc>`

describe('leitura do XML da NF-e', () => {
  it('lê cabeçalho e fornecedor de uma nota autorizada', () => {
    const nfe = parseNFeXml(NFE_AUTORIZADA)

    expect(nfe.chave_acesso).toBe('35240612345678000199550010000123451000123456')
    expect(nfe.numero).toBe('12345')
    expect(nfe.serie).toBe('1')
    expect(nfe.fornecedor_cnpj).toBe('12345678000199')
    expect(nfe.fornecedor_nome).toBe('DISTRIBUIDORA REFRIGERACAO LTDA')
    expect(nfe.valor_total).toBe(4395)
    expect(nfe.data_emissao).toBe('2026-09-01T10:30:00-03:00')
  })

  it('lê todos os itens com quantidade e custo', () => {
    const nfe = parseNFeXml(NFE_AUTORIZADA)

    expect(nfe.itens).toHaveLength(2)
    expect(nfe.itens[0]).toMatchObject({
      numero_item: 1,
      codigo_produto_fornecedor: 'COMP-14',
      ean: '7891234567895',
      descricao: 'COMPRESSOR 1/4 HP 220V',
      ncm: '84143011',
      cest: '2104700',
      unidade: 'UN',
      quantidade: 10,
      valor_unitario: 275.5,
      valor_total: 2755,
    })
  })

  it('trata "SEM GTIN" como produto sem código de barras', () => {
    // Se isso virasse o texto "SEM GTIN", o primeiro item sem GTIN ocuparia o
    // código de barras e o segundo quebraria no índice único.
    const nfe = parseNFeXml(NFE_AUTORIZADA)
    expect(nfe.itens[1].ean).toBeNull()
    expect(nfe.itens[1].cest).toBeNull()
  })

  it('cai para o Id do infNFe quando a nota não tem protocolo', () => {
    const semProtocolo = NFE_AUTORIZADA.replace(/<protNFe[\s\S]*<\/protNFe>/, '')
    const nfe = parseNFeXml(semProtocolo)
    expect(nfe.chave_acesso).toBe('35240612345678000199550010000123451000123456')
  })

  it('recusa arquivo que não é NF-e, com mensagem clara', () => {
    expect(() => parseNFeXml('<xml><algo/></xml>')).toThrow(/não parece ser o XML de uma NF-e/)
  })

  it('recusa XML corrompido', () => {
    expect(() => parseNFeXml('<nfeProc><infNFe>')).toThrow(/inválido ou corrompido/)
  })

  it('recusa nota sem nenhum item', () => {
    const semItens = NFE_AUTORIZADA.replace(/<det nItem="[\s\S]*<\/det>/, '')
    expect(() => parseNFeXml(semItens)).toThrow(/Nenhum item/)
  })
})
