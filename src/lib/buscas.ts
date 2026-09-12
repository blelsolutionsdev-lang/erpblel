// Fontes de dados dos comboboxes: busca no servidor, sempre limitada.
// Antes cada tela carregava a base inteira num <Select> sem busca.

import type { OpcaoCombobox } from '@/components/campos/Combobox'
import { supabase } from '@/lib/supabase'

const LIMITE = 20

export async function buscarClientes(termo: string): Promise<OpcaoCombobox[]> {
  let query = supabase.from('clientes').select('id, nome, cpf_cnpj').eq('ativo', true).order('nome').limit(LIMITE)
  if (termo) query = query.or(`nome.ilike.%${termo}%,cpf_cnpj.ilike.%${termo}%`)
  const { data } = await query
  return (data ?? []).map((c) => ({ value: c.id, label: c.nome, descricao: c.cpf_cnpj ?? undefined }))
}

export async function carregarCliente(id: string): Promise<OpcaoCombobox | null> {
  const { data } = await supabase.from('clientes').select('id, nome, cpf_cnpj').eq('id', id).maybeSingle()
  return data ? { value: data.id, label: data.nome, descricao: data.cpf_cnpj ?? undefined } : null
}

export async function buscarFornecedores(termo: string): Promise<OpcaoCombobox[]> {
  let query = supabase
    .from('fornecedores')
    .select('id, nome, cpf_cnpj')
    .eq('ativo', true)
    .order('nome')
    .limit(LIMITE)
  if (termo) query = query.or(`nome.ilike.%${termo}%,cpf_cnpj.ilike.%${termo}%`)
  const { data } = await query
  return (data ?? []).map((f) => ({ value: f.id, label: f.nome, descricao: f.cpf_cnpj ?? undefined }))
}

export async function carregarFornecedor(id: string): Promise<OpcaoCombobox | null> {
  const { data } = await supabase.from('fornecedores').select('id, nome, cpf_cnpj').eq('id', id).maybeSingle()
  return data ? { value: data.id, label: data.nome, descricao: data.cpf_cnpj ?? undefined } : null
}

export async function buscarProdutos(termo: string): Promise<OpcaoCombobox[]> {
  let query = supabase
    .from('produtos')
    .select('id, nome, sku, tipo, estoque_atual, preco_venda')
    .eq('ativo', true)
    .order('nome')
    .limit(LIMITE)
  if (termo) query = query.or(`nome.ilike.%${termo}%,sku.ilike.%${termo}%,codigo_barras.ilike.%${termo}%`)
  const { data } = await query
  return (data ?? []).map((p) => ({
    value: p.id,
    label: p.tipo === 'kit' ? `${p.nome} (kit)` : p.nome,
    descricao: p.tipo === 'kit' ? p.sku ?? undefined : `saldo ${p.estoque_atual}${p.sku ? ` · ${p.sku}` : ''}`,
  }))
}

export async function carregarProduto(id: string): Promise<OpcaoCombobox | null> {
  const { data } = await supabase.from('produtos').select('id, nome, tipo').eq('id', id).maybeSingle()
  return data ? { value: data.id, label: data.tipo === 'kit' ? `${data.nome} (kit)` : data.nome } : null
}

/** Só kits, para a explosão de ficha técnica. */
export async function buscarKits(termo: string): Promise<OpcaoCombobox[]> {
  let query = supabase
    .from('produtos')
    .select('id, nome, sku')
    .eq('ativo', true)
    .eq('tipo', 'kit')
    .order('nome')
    .limit(LIMITE)
  if (termo) query = query.or(`nome.ilike.%${termo}%,sku.ilike.%${termo}%`)
  const { data } = await query
  return (data ?? []).map((p) => ({ value: p.id, label: p.nome, descricao: p.sku ?? undefined }))
}

/**
 * Componentes elegíveis para a ficha técnica de um produto.
 *
 * Exclui o próprio produto no servidor; o resto dos ciclos (A contém B que
 * contém A) é barrado pelo gatilho `impedir_ciclo_ficha` no banco.
 */
export function buscarComponentes(produtoId: string) {
  return async (termo: string): Promise<OpcaoCombobox[]> => {
    let query = supabase
      .from('produtos')
      .select('id, nome, sku, tipo, estoque_atual, preco_custo')
      .eq('ativo', true)
      .neq('id', produtoId)
      .order('nome')
      .limit(LIMITE)
    if (termo) query = query.or(`nome.ilike.%${termo}%,sku.ilike.%${termo}%`)
    const { data } = await query
    return (data ?? []).map((p) => ({
      value: p.id,
      label: p.tipo === 'kit' ? `${p.nome} (submontado)` : p.nome,
      descricao:
        p.tipo === 'kit'
          ? (p.sku ?? undefined)
          : `saldo ${p.estoque_atual}${p.sku ? ` · ${p.sku}` : ''}`,
    }))
  }
}

export async function buscarServicos(termo: string): Promise<OpcaoCombobox[]> {
  let query = supabase.from('servicos').select('id, nome, preco').eq('ativo', true).order('nome').limit(LIMITE)
  if (termo) query = query.ilike('nome', `%${termo}%`)
  const { data } = await query
  return (data ?? []).map((s) => ({ value: s.id, label: s.nome }))
}

export async function carregarServico(id: string): Promise<OpcaoCombobox | null> {
  const { data } = await supabase.from('servicos').select('id, nome').eq('id', id).maybeSingle()
  return data ? { value: data.id, label: data.nome } : null
}

export function descreverEquipamento(eq: {
  tipo?: string | null
  marca?: string | null
  modelo?: string | null
  numero_serie?: string | null
}) {
  return (
    [eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.numero_serie || 'Equipamento'
  )
}

export function buscarEquipamentosDoCliente(clienteId: string) {
  return async (termo: string): Promise<OpcaoCombobox[]> => {
    if (!clienteId) return []
    let query = supabase
      .from('equipamentos')
      .select('id, tipo, marca, modelo, numero_serie')
      .eq('cliente_id', clienteId)
      .eq('ativo', true)
      .order('created_at')
      .limit(LIMITE)
    if (termo) {
      query = query.or(
        `tipo.ilike.%${termo}%,marca.ilike.%${termo}%,modelo.ilike.%${termo}%,numero_serie.ilike.%${termo}%`,
      )
    }
    const { data } = await query
    return (data ?? []).map((e) => ({
      value: e.id,
      label: descreverEquipamento(e),
      descricao: e.numero_serie ? `nº ${e.numero_serie}` : undefined,
    }))
  }
}

export async function carregarEquipamento(id: string): Promise<OpcaoCombobox | null> {
  const { data } = await supabase
    .from('equipamentos')
    .select('id, tipo, marca, modelo, numero_serie')
    .eq('id', id)
    .maybeSingle()
  return data ? { value: data.id, label: descreverEquipamento(data) } : null
}

export async function buscarTecnicos(termo: string): Promise<OpcaoCombobox[]> {
  let query = supabase.from('profiles').select('id, nome').eq('ativo', true).order('nome').limit(LIMITE)
  if (termo) query = query.ilike('nome', `%${termo}%`)
  const { data } = await query
  return (data ?? []).map((t) => ({ value: t.id, label: t.nome }))
}

export async function carregarTecnico(id: string): Promise<OpcaoCombobox | null> {
  const { data } = await supabase.from('profiles').select('id, nome').eq('id', id).maybeSingle()
  return data ? { value: data.id, label: data.nome } : null
}
