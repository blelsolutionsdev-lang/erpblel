// Edge Function: parse-danfe
//
// Recebe um PDF de DANFE (representação impressa de uma NF-e) e usa a API da
// Anthropic (Claude, com leitura nativa de PDF) para extrair os dados
// estruturados: fornecedor, cabeçalho da nota e itens.
//
// Requer o secret ANTHROPIC_API_KEY configurado no projeto Supabase
// (Dashboard → Edge Functions → Secrets, ou `supabase secrets set`).
// Sem esse secret, a função responde 500 com uma mensagem explicando o que
// falta — não expõe nem pede a chave por nenhum outro caminho.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-sonnet-5'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXTRACT_TOOL = {
  name: 'registrar_dados_nfe',
  description: 'Registra os dados estruturados extraídos de uma DANFE/NF-e em PDF.',
  input_schema: {
    type: 'object',
    properties: {
      chave_acesso: { type: ['string', 'null'], description: 'Chave de acesso de 44 dígitos, se legível' },
      numero: { type: ['string', 'null'] },
      serie: { type: ['string', 'null'] },
      data_emissao: { type: ['string', 'null'], description: 'Data de emissão em ISO 8601' },
      fornecedor_cnpj: { type: ['string', 'null'], description: 'Somente dígitos' },
      fornecedor_nome: { type: ['string', 'null'] },
      valor_total: { type: ['number', 'null'] },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            codigo_produto_fornecedor: { type: 'string' },
            descricao: { type: 'string' },
            ncm: { type: ['string', 'null'] },
            cest: { type: ['string', 'null'] },
            unidade: { type: ['string', 'null'] },
            quantidade: { type: 'number' },
            valor_unitario: { type: 'number' },
            valor_total: { type: 'number' },
          },
          required: ['descricao', 'quantidade', 'valor_unitario', 'valor_total'],
        },
      },
    },
    required: ['itens'],
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          'Secret ANTHROPIC_API_KEY não configurada neste projeto Supabase. ' +
          'Configure em Project Settings → Edge Functions → Secrets.',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const { pdf_base64 } = await req.json()
    if (!pdf_base64 || typeof pdf_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'Campo pdf_base64 é obrigatório.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: EXTRACT_TOOL.name },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: pdf_base64 },
              },
              {
                type: 'text',
                text:
                  'Este é o DANFE (representação em PDF) de uma NF-e brasileira. Extraia os dados ' +
                  'estruturados chamando a ferramenta registrar_dados_nfe. quantidade, valor_unitario ' +
                  'e valor_total de cada item devem ser números (não strings, sem separador de milhar). ' +
                  'Se algum campo não estiver legível, use null.',
              },
            ],
          },
        ],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      return new Response(
        JSON.stringify({ error: `Erro na API da Anthropic (${anthropicRes.status}): ${errText}` }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const data = await anthropicRes.json()
    const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use')
    if (!toolUse) {
      return new Response(JSON.stringify({ error: 'Não foi possível extrair os dados do PDF.' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(toolUse.input), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
