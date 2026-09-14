// Tradução de erros do Supabase para mensagens que fazem sentido na tela.
//
// Antes cada tela fazia `toast.error(error.message)`, o que mostrava coisas
// como `new row violates row-level security policy for table "produtos"` para
// o usuário final, e as Edge Functions devolviam só "Edge Function returned a
// non-2xx status code", escondendo a mensagem real que a função tinha enviado.

type PostgrestLike = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

export function mensagemErro(error: unknown): string {
  if (!ehObjeto(error)) return String(error ?? 'Erro inesperado.')

  const err = error as PostgrestLike
  const msg = err.message ?? ''

  // 42501 cobre tanto as nossas exceções de permissão (que já têm texto bom)
  // quanto as recusas automáticas do RLS (que não têm).
  if (err.code === '42501' || /row-level security/i.test(msg)) {
    if (/row-level security/i.test(msg)) {
      return 'Você não tem permissão para fazer isso.'
    }
    return msg
  }

  if (err.code === '23505') {
    if (/cpf_cnpj/.test(msg)) return 'Já existe um cadastro com esse CPF/CNPJ.'
    if (/codigo_barras/.test(msg)) return 'Já existe um produto com esse código de barras.'
    if (/sku/.test(msg)) return 'Já existe um produto com esse SKU.'
    if (/chave_acesso/.test(msg)) return 'Essa NF-e já foi lançada.'
    return msg || 'Esse registro já existe.'
  }

  if (err.code === '23503') {
    return 'Este registro está em uso por outro cadastro e não pode ser removido.'
  }

  if (err.code === 'PGRST116') {
    return 'Registro não encontrado.'
  }

  return msg || 'Erro inesperado.'
}

/**
 * Erros de Edge Function trazem a resposta HTTP em `context`; o corpo tem a
 * mensagem de verdade.
 */
export async function mensagemErroFuncao(error: unknown): Promise<string> {
  if (ehObjeto(error) && 'context' in error) {
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      try {
        const body = await ctx.clone().json()
        if (body?.error) return String(body.error)
      } catch {
        // corpo não era JSON — ignora e cai no fallback abaixo
      }
    }
  }
  return mensagemErro(error)
}
