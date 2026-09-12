// Edge Function: admin-users
//
// CRUD de usuários que exige privilégios de administrador do Supabase Auth
// (criar conta, resetar senha, apagar conta) — operações que a API pública
// (anon/publishable key) não permite fazer do client.
//
// Usa SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY, que o
// Supabase injeta automaticamente em toda Edge Function.
//
// Quem chama precisa estar autenticado E ter a permissão
// 'administrativo.usuarios.gerenciar' (checada via a função de banco
// user_has_permission, com o JWT de quem chamou e a chave anônima — a service
// role só entra depois que a permissão foi confirmada).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, exigirPermissao, json } from '../_shared/http.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

// Math.random() não é criptograficamente seguro: senhas provisórias geradas a
// partir dele são previsíveis se alguém observar algumas. crypto é.
function gerarSenhaTemporaria() {
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  let senha = ''
  for (const b of bytes) senha += ALFABETO[b % ALFABETO.length]
  return senha + '!9'
}

function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed' }, 405)
  }

  const auth = await exigirPermissao(req, 'administrativo.usuarios.gerenciar')
  if (auth instanceof Response) return auth

  // Client com privilégio total, só usado depois de confirmar a permissão acima.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json(req, { error: 'Corpo da requisição inválido.' }, 400)
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
      return json(req, { error: 'Informe nome, e-mail e papel.' }, 400)
    }
    if (!emailValido(email)) {
      return json(req, { error: 'E-mail inválido.' }, 400)
    }

    const { data: papel } = await adminClient.from('roles').select('id').eq('id', role_id).maybeSingle()
    if (!papel) {
      return json(req, { error: 'Papel informado não existe.' }, 400)
    }

    const senha = gerarSenhaTemporaria()
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (createErr || !created?.user) {
      return json(req, { error: createErr?.message ?? 'Não foi possível criar o usuário.' }, 400)
    }

    // handle_new_user já criou o profile com o papel mínimo em resposta ao
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
        // A senha gerada aqui é provisória: o app obriga a troca no primeiro
        // acesso em vez de deixá-la virar a senha definitiva.
        deve_trocar_senha: true,
      },
      { onConflict: 'id' },
    )
    if (upsertErr) {
      // Não deixa conta órfã no Auth sem perfil utilizável no ERP.
      await adminClient.auth.admin.deleteUser(created.user.id)
      return json(req, { error: upsertErr.message }, 400)
    }

    return json(req, { user_id: created.user.id, senha_temporaria: senha })
  }

  if (action === 'reset_password') {
    const { user_id } = payload as { user_id?: string }
    if (!user_id) return json(req, { error: 'user_id é obrigatório.' }, 400)

    const senha = gerarSenhaTemporaria()
    const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: senha })
    if (error) return json(req, { error: error.message }, 400)

    await adminClient.from('profiles').update({ deve_trocar_senha: true }).eq('id', user_id)

    return json(req, { senha_temporaria: senha })
  }

  if (action === 'delete') {
    const { user_id } = payload as { user_id?: string }
    if (!user_id) return json(req, { error: 'user_id é obrigatório.' }, 400)
    if (user_id === auth.userId) {
      return json(req, { error: 'Você não pode excluir a própria conta.' }, 400)
    }

    const { error } = await adminClient.auth.admin.deleteUser(user_id)
    if (error) return json(req, { error: error.message }, 400)

    return json(req, { ok: true })
  }

  return json(req, { error: `Ação desconhecida: ${action}` }, 400)
})
