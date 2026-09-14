// Helpers compartilhados pelas Edge Functions: CORS e checagem de
// autenticação + permissão.
//
// Antes, parse-danfe e focus-nfe-consulta não checavam nada: como a chave
// publishable vai no bundle do front, qualquer pessoa podia queimar a cota da
// API da Anthropic ou consultar NF-e da empresa na Focus só com a chave de
// acesso. Agora as três funções exigem sessão válida e permissão.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// Configure ALLOWED_ORIGINS (lista separada por vírgula) nos secrets para
// restringir quem pode chamar as funções pelo navegador. Sem a variável, mantém
// o comportamento aberto de antes.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allow =
    ALLOWED_ORIGINS.length === 0 ? '*' : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(ALLOWED_ORIGINS.length > 0 ? { Vary: 'Origin' } : {}),
  }
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

export type Autorizado = {
  userId: string
  /** Client com o JWT de quem chamou — sujeito ao RLS desse usuário. */
  client: ReturnType<typeof createClient>
}

/**
 * Exige sessão válida e, opcionalmente, uma permissão do ERP.
 * Devolve `Response` de erro quando barrado, ou os dados do usuário.
 */
export async function exigirPermissao(
  req: Request,
  chave?: string,
): Promise<Response | Autorizado> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json(req, { error: 'Não autenticado.' }, 401)
  }

  // Client com a chave anônima + o JWT do chamador: nunca escala privilégio
  // sozinho, mesmo que o header venha malformado.
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await client.auth.getUser()
  if (error || !data?.user) {
    return json(req, { error: 'Sessão inválida ou expirada.' }, 401)
  }

  if (chave) {
    const { data: permitido, error: permErr } = await client.rpc('user_has_permission', {
      p_chave: chave,
    })
    if (permErr || !permitido) {
      return json(req, { error: `Você não tem a permissão "${chave}".` }, 403)
    }
  }

  return { userId: data.user.id, client }
}
