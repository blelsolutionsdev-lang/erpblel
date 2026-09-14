// Custo de uma ordem de produção.
//
// Mesma conta que `concluir_ordem_producao()` faz em SQL — é ela que define o
// custo do produto acabado e, por consequência, a margem de tudo que for
// vendido depois. Os testes travam as duas versões juntas.

export type ConsumoOrdem = {
  /** Quanto foi para dentro do produto. */
  consumido: number
  /** Refugo do componente: sai do estoque e não vira produto. */
  perdido: number
  /** Custo médio do componente no momento da baixa. */
  custo_unitario: number
}

/**
 * Custo total da ordem.
 *
 * A perda entra no custo: o material saiu do estoque e alguém tem que absorver.
 * Quem absorve são as unidades boas — é assim que custo de produção funciona.
 */
export function custoOrdem(consumos: ConsumoOrdem[]) {
  const total = consumos.reduce(
    (soma, c) => soma + (c.consumido + c.perdido) * c.custo_unitario,
    0,
  )
  return Math.round(total * 100) / 100
}

/** Custo de cada unidade boa. Zero unidades boas, zero custo unitário. */
export function custoUnitarioProduzido(custoTotal: number, quantidadeProduzida: number) {
  if (!(quantidadeProduzida > 0)) return 0
  return Math.round((custoTotal / quantidadeProduzida) * 100) / 100
}
