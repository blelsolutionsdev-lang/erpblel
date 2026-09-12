// Edge Function: parse-danfe
//
// Recebe um PDF de DANFE (representação impressa de uma NF-e) e usa a API da
// Anthropic (Claude, com leitura nativa de PDF) para extrair os dados
// estruturados: fornecedor, cabeçalho da nota e itens.
//
// Exige sessão válida e a permissão 'estoque.entradas.processar' — sem isso
// qualquer um com a chave publishable (que vai no bundle do front) poderia
// gastar a cota da API da Anthropic.
//
// Requer o secret ANTHROPIC_API_KEY configurado no projeto Supabase
// (Dashboard → Edge Functions → Secrets, ou `supabase secrets set`).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders, exigirPermissao, json } from '../_shared/http.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-sonnet-5'

// 10 MB de PDF viram ~13,4 MB em base64; acima disso a chamada estoura o limite
// de payload da própria Edge Function, então recusamos com mensagem clara.
const MAX_PDF_BASE64_BYTES = 14_000_000

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
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed' }, 405)
  }

  const auth = await exigirPermissao(req, 'estoque.entradas.processar')
  if (auth instanceof Response) return auth

  if (!ANTHROPIC_API_KEY) {
    return json(
      req,
      {
        error:
          'Secret ANTHROPIC_API_KEY não configurada neste projeto Supabase. ' +
          'Configure em Project Settings → Edge Functions → Secrets.',
      },
      500,
    )
  }

  try {
    const { pdf_base64 } = await req.json()
    if (!pdf_base64 || typeof pdf_base64 !== 'string') {
      return json(req, { error: 'Campo pdf_base64 é obrigatório.' }, 400)
    }
    if (pdf_base64.length > MAX_PDF_BASE64_BYTES) {
      return json(req, { error: 'PDF grande demais (máximo ~10 MB).' }, 413)
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
      return json(req, { error: `Erro na API da Anthropic (${anthropicRes.status}): ${errText}` }, 502)
    }

    const data = await anthropicRes.json()
    const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use')
    if (!toolUse) {
      return json(req, { error: 'Não foi possível extrair os dados do PDF.' }, 502)
    }

    return json(req, toolUse.input)
  } catch (err) {
    return json(req, { error: String(err) }, 500)
  }
})
