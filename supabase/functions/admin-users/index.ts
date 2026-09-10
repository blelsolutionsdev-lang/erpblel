// Edge Function: admin-users
//
// CRUD de usuários que exige privilégios de administrador do Supabase Auth
// (criar conta, resetar senha, apagar conta) — operações que a API pública
// (anon/publishable key) não permite fazer do client.
//
// Usa SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, que o Supabase já injeta
// automaticamente em toda Edge Function — não é preciso configurar nada.
//
// Quem chama precisa estar autenticado E ter a permissão
// 'administrativo.usuarios.gerenciar' (checada via a função de banco
// user_has_permission, com o JWT de quem chamou).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function gerarSenhaTemporaria() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let senha = ''
  for (let i = 0; i < 12; i++) senha += chars[Math.floor(Math.random() * chars.length)]
  return senha + '!9'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Não autenticado.' }, 401)
  }

  // Client com o JWT de quem chamou, só pra identificar o usuário e checar permissão.
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ error: 'Sessão inválida.' }, 401)
  }

  const { data: temPermissao, error: permErr } = await callerClient.rpc('user_has_permission', {
    p_chave: 'administrativo.usuarios.gerenciar',
  })
  if (permErr || !temPermissao) {
    return json({ error: 'Você não tem permissão para gerenciar usuários.' }, 403)
  }

  // Client com privilégio total, só usado depois de confirmar a permissão acima.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const action = payload.action as string

  if (action === 'create') {
    const { email, nome, role_id, telefone } = payload as {
      email?: string
      nome?: string
      role_id?: string
      telefone?: string
    }
    if (!email || !nome || !role_id) {
      return json({ error: 'Informe nome, e-mail e papel.' }, 400)
    }

    const senha = gerarSenhaTemporaria()
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? 'Não foi possível criar o usuário.' }, 400)
    }

    // handle_new_user já criou o profile com o papel padrão em resposta ao
    // INSERT em auth.users. Upsert ajusta papel/telefone/nome numa tacada só,
    // funcionando tanto se a linha já existir (o caso normal) quanto se por
    // algum motivo ainda não existir.
    const { error: upsertErr } = await adminClient.from('profiles').upsert(
      {
        id: created.user.id,
        nome,
        email,
        role_id,
        telefone: telefone ?? null,
      },
      { onConflict: 'id' },
    )
    if (upsertErr) {
      return json({ error: upsertErr.message }, 400)
    }

    return json({ user_id: created.user.id, senha_temporaria: senha })
  }

  if (action === 'reset_password') {
    const { user_id } = payload as { user_id?: string }
    if (!user_id) return json({ error: 'user_id é obrigatório.' }, 400)

    const senha = gerarSenhaTemporaria()
    const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: senha })
    if (error) return json({ error: error.message }, 400)

    return json({ senha_temporaria: senha })
  }

  if (action === 'delete') {
    const { user_id } = payload as { user_id?: string }
    if (!user_id) return json({ error: 'user_id é obrigatório.' }, 400)
    if (user_id === userData.user.id) {
      return json({ error: 'Você não pode excluir a própria conta.' }, 400)
    }

    const { error } = await adminClient.auth.admin.deleteUser(user_id)
    if (error) return json({ error: error.message }, 400)

    return json({ ok: true })
  }

  return json({ error: `Ação desconhecida: ${action}` }, 400)
})
