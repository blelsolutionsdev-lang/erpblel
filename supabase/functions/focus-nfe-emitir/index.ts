// Edge Function: focus-nfe-emitir
//
// Emite a NFC-e de uma OS concluída na Focus NFE e devolve o status. O payload
// é montado no banco (preparar_nfce_os), que também reserva o número da série
// e cria a linha em notas_fiscais_saida; aqui só falam com a Focus e gravam o
// retorno (registrar_retorno_nfce).
//
// Exige sessão válida e a permissão 'fiscal.gerenciar'.
//
// Secrets: FOCUS_NFE_TOKEN (obrigatório). O ambiente vem da configuração
// fiscal salva no banco, não de variável de ambiente — homologação e produção
// usam hosts diferentes na Focus.
//
// Chamadas aceitas:
//   { os_id }                          → prepara e envia
//   { nota_id, apenas_consultar: true} → só consulta o status de uma nota pendente

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, exigirPermissao, json } from '../_shared/http.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FOCUS_NFE_TOKEN = Deno.env.get('FOCUS_NFE_TOKEN')

function baseUrl(ambiente: string) {
  return ambiente === 'producao'
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br'
}

/** Traduz o status da Focus para o enum nfce_status do banco. */
function traduzirStatus(status: string | undefined): string {
  switch (status) {
    case 'autorizado':
      return 'autorizada'
    case 'cancelado':
      return 'cancelada'
    case 'erro_autorizacao':
    case 'rejeitado':
      return 'rejeitada'
    case 'processando_autorizacao':
      return 'pendente'
    default:
      return 'erro'
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed' }, 405)
  }

  const auth = await exigirPermissao(req, 'fiscal.gerenciar')
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

  let body: { os_id?: string; nota_id?: string; apenas_consultar?: boolean }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Corpo da requisição inválido.' }, 400)
  }

  // Client com o JWT do chamador: as RPCs continuam checando permissão e RLS.
  const db = auth.client
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const focusAuth = 'Basic ' + btoa(`${FOCUS_NFE_TOKEN}:`)

  try {
    // ---------------------------------------------------------- consulta
    if (body.apenas_consultar) {
      if (!body.nota_id) return json(req, { error: 'Informe nota_id.' }, 400)

      const { data: nota, error: notaErr } = await admin
        .from('notas_fiscais_saida')
        .select('id, focus_nfe_ref, ambiente')
        .eq('id', body.nota_id)
        .single()
      if (notaErr || !nota) return json(req, { error: 'Nota não encontrada.' }, 404)

      const res = await fetch(
        `${baseUrl(nota.ambiente)}/v2/nfce/${nota.focus_nfe_ref}?completa=1`,
        { headers: { Authorization: focusAuth } },
      )
      const retorno = await res.json().catch(() => ({}))
      const status = traduzirStatus(retorno?.status)

      await db.rpc('registrar_retorno_nfce', {
        p_nota_id: nota.id,
        p_status: status,
        p_chave: retorno?.chave_nfe ?? null,
        p_xml_url: retorno?.caminho_xml_nota_fiscal
          ? `${baseUrl(nota.ambiente)}${retorno.caminho_xml_nota_fiscal}`
          : null,
        p_danfe_url: retorno?.caminho_danfe
          ? `${baseUrl(nota.ambiente)}${retorno.caminho_danfe}`
          : null,
        p_erro: retorno?.mensagem_sefaz ?? retorno?.mensagem ?? null,
      })

      return json(req, { status, chave: retorno?.chave_nfe ?? null })
    }

    // ---------------------------------------------------------- emissão
    if (!body.os_id) return json(req, { error: 'Informe os_id.' }, 400)

    // Monta o payload, reserva o número e cria a nota como pendente.
    const { data: preparado, error: prepErr } = await db.rpc('preparar_nfce_os', {
      p_os_id: body.os_id,
    })
    if (prepErr) return json(req, { error: prepErr.message }, 400)

    const { nota_id, ref, ambiente, payload } = preparado as {
      nota_id: string
      ref: string
      ambiente: string
      payload: Record<string, unknown>
    }

    const res = await fetch(`${baseUrl(ambiente)}/v2/nfce?ref=${encodeURIComponent(ref)}`, {
      method: 'POST',
      headers: { Authorization: focusAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const retorno = await res.json().catch(() => ({}))

    // A Focus responde 202 enquanto a SEFAZ processa; erro de validação vem 4xx
    // com o motivo — nos dois casos o retorno fica gravado na nota.
    const status = res.ok || res.status === 202 ? traduzirStatus(retorno?.status) : 'rejeitada'
    const erro =
      retorno?.mensagem_sefaz ??
      retorno?.mensagem ??
      (Array.isArray(retorno?.erros) ? retorno.erros.map((e: { mensagem?: string }) => e.mensagem).join('; ') : null)

    await db.rpc('registrar_retorno_nfce', {
      p_nota_id: nota_id,
      p_status: status,
      p_chave: retorno?.chave_nfe ?? null,
      p_xml_url: retorno?.caminho_xml_nota_fiscal
        ? `${baseUrl(ambiente)}${retorno.caminho_xml_nota_fiscal}`
        : null,
      p_danfe_url: retorno?.caminho_danfe ? `${baseUrl(ambiente)}${retorno.caminho_danfe}` : null,
      p_erro: status === 'autorizada' ? null : erro,
    })

    if (status === 'rejeitada' || status === 'erro') {
      return json(req, { error: erro ?? `Focus NFE respondeu ${res.status}.`, status }, 502)
    }

    return json(req, { status, chave: retorno?.chave_nfe ?? null, nota_id })
  } catch (err) {
    return json(req, { error: String(err) }, 500)
  }
})
