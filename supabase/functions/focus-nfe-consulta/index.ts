// Edge Function: focus-nfe-consulta
//
// Consulta uma NF-e recebida (de compra) direto na Focus NFE a partir da
// chave de acesso de 44 dígitos, sem precisar de arquivo nenhum.
//
// Endpoint oficial: GET /v2/nfes_recebidas/{chave}.json?completa=1
// Autenticação: HTTP Basic (token da empresa como usuário, senha em branco)
// Docs: https://doc.focusnfe.com.br/reference/consultar_nfe_recebida_individual_json
//
// Requer os secrets FOCUS_NFE_TOKEN (obrigatório) e, opcionalmente,
// FOCUS_NFE_AMBIENTE ('homologacao' | 'producao', default 'homologacao').
// Configure em Project Settings → Edge Functions → Secrets.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const FOCUS_NFE_TOKEN = Deno.env.get('FOCUS_NFE_TOKEN')
const FOCUS_NFE_AMBIENTE = Deno.env.get('FOCUS_NFE_AMBIENTE') ?? 'homologacao'

const BASE_URL =
  FOCUS_NFE_AMBIENTE === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  if (!FOCUS_NFE_TOKEN) {
    return new Response(
      JSON.stringify({
        error:
          'Secret FOCUS_NFE_TOKEN não configurada neste projeto Supabase. ' +
          'Configure em Project Settings → Edge Functions → Secrets.',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const { chave } = await req.json()
    if (!chave || typeof chave !== 'string' || chave.replace(/\D/g, '').length !== 44) {
      return new Response(JSON.stringify({ error: 'Informe uma chave de acesso válida (44 dígitos).' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    const chaveDigits = chave.replace(/\D/g, '')

    const auth = 'Basic ' + btoa(`${FOCUS_NFE_TOKEN}:`)
    const focusRes = await fetch(`${BASE_URL}/v2/nfes_recebidas/${chaveDigits}.json?completa=1`, {
      headers: { Authorization: auth },
    })

    if (!focusRes.ok) {
      const errText = await focusRes.text()
      return new Response(
        JSON.stringify({ error: `Focus NFE respondeu ${focusRes.status}: ${errText}` }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
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

    return new Response(
      JSON.stringify({
        chave_acesso: chaveDigits,
        numero: nfe.numero ?? null,
        serie: nfe.serie ?? null,
        data_emissao: nfe.data_emissao ?? null,
        fornecedor_cnpj: nfe.documento_emitente ?? null,
        fornecedor_nome: nfe.nome_emitente ?? null,
        valor_total: nfe.valor_total != null ? Number(nfe.valor_total) : null,
        itens,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
