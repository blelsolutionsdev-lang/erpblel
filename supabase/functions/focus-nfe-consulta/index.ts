// Edge Function: focus-nfe-consulta
//
// Consulta uma NF-e recebida (de compra) direto na Focus NFE a partir da
// chave de acesso de 44 dígitos, sem precisar de arquivo nenhum.
//
// Exige sessão válida e a permissão 'estoque.entradas.processar': o token da
// Focus é da empresa, e sem essa checagem qualquer um com a chave publishable
// conseguiria puxar dados de notas da empresa informando só a chave.
//
// Endpoint oficial: GET /v2/nfes_recebidas/{chave}.json?completa=1
// Autenticação: HTTP Basic (token da empresa como usuário, senha em branco)
// Docs: https://doc.focusnfe.com.br/reference/consultar_nfe_recebida_individual_json
//
// Requer os secrets FOCUS_NFE_TOKEN (obrigatório) e, opcionalmente,
// FOCUS_NFE_AMBIENTE ('homologacao' | 'producao', default 'homologacao').

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders, exigirPermissao, json } from '../_shared/http.ts'

const FOCUS_NFE_TOKEN = Deno.env.get('FOCUS_NFE_TOKEN')
const FOCUS_NFE_AMBIENTE = Deno.env.get('FOCUS_NFE_AMBIENTE') ?? 'homologacao'

const BASE_URL =
  FOCUS_NFE_AMBIENTE === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br'

type FocusItem = {
  numero_item?: number
  codigo_produto?: string
  descricao?: string
  codigo_ncm?: string
  cest?: string
  unidade_comercial?: string
  quantidade_comercial?: string | number
  valor_unitario_comercial?: string | number
  valor_bruto?: string | number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed' }, 405)
  }

  const auth = await exigirPermissao(req, 'estoque.entradas.processar')
  if (auth instanceof Response) return auth

  if (!FOCUS_NFE_TOKEN) {
    return json(
      req,
      {
        error:
          'Secret FOCUS_NFE_TOKEN não configurada neste projeto Supabase. ' +
          'Configure em Project Settings → Edge Functions → Secrets.',
      },
      500,
    )
  }

  try {
    const { chave } = await req.json()
    if (!chave || typeof chave !== 'string' || chave.replace(/\D/g, '').length !== 44) {
      return json(req, { error: 'Informe uma chave de acesso válida (44 dígitos).' }, 400)
    }
    const chaveDigits = chave.replace(/\D/g, '')

    const focusAuth = 'Basic ' + btoa(`${FOCUS_NFE_TOKEN}:`)
    const focusRes = await fetch(`${BASE_URL}/v2/nfes_recebidas/${chaveDigits}.json?completa=1`, {
      headers: { Authorization: focusAuth },
    })

    if (!focusRes.ok) {
      const errText = await focusRes.text()
      return json(req, { error: `Focus NFE respondeu ${focusRes.status}: ${errText}` }, 502)
    }

    const nfe = await focusRes.json()

    const itens = (nfe.itens ?? []).map((item: FocusItem) => ({
      codigo_produto_fornecedor: item.codigo_produto ?? '',
      descricao: item.descricao ?? '',
      ncm: item.codigo_ncm ?? null,
      cest: item.cest ?? null,
      unidade: item.unidade_comercial ?? null,
      quantidade: Number(item.quantidade_comercial ?? 0),
      valor_unitario: Number(item.valor_unitario_comercial ?? 0),
      valor_total: Number(item.valor_bruto ?? 0),
    }))

    return json(req, {
      chave_acesso: chaveDigits,
      numero: nfe.numero ?? null,
      serie: nfe.serie ?? null,
      data_emissao: nfe.data_emissao ?? null,
      fornecedor_cnpj: nfe.documento_emitente ?? null,
      fornecedor_nome: nfe.nome_emitente ?? null,
      valor_total: nfe.valor_total != null ? Number(nfe.valor_total) : null,
      itens,
    })
  } catch (err) {
    return json(req, { error: String(err) }, 500)
  }
})
