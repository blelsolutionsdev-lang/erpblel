// Rótulos das origens de movimentação de estoque.
//
// Três telas mantinham este mapa por conta própria — com grafias diferentes
// para a mesma origem e sem as novas. Uma origem nova agora aparece nomeada em
// todas de uma vez.

export const ORIGENS_MOVIMENTACAO: Record<string, string> = {
  compra_xml: 'NF-e (XML)',
  compra_pdf: 'NF-e (PDF)',
  compra_chave: 'NF-e (chave)',
  os_baixa: 'Baixa de OS',
  os_estorno: 'Estorno de OS',
  kit_baixa: 'Componente de kit',
  op_consumo: 'Consumo de produção',
  op_perda: 'Perda na produção',
  op_entrada: 'Produção concluída',
  ajuste_manual: 'Ajuste manual',
}

export function rotuloOrigem(origem: string | null | undefined) {
  if (!origem) return '—'
  return ORIGENS_MOVIMENTACAO[origem] ?? origem
}
