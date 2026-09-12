// Cálculo da ficha técnica (BOM).
//
// A mesma conta existe em SQL, dentro de `ativar_ficha_tecnica()`: é ela que
// congela o custo da versão. Aqui ela serve para mostrar o custo estimado do
// rascunho antes de ativar — se as duas divergirem, a pessoa ativa esperando um
// número e recebe outro. Os testes deste arquivo travam a fórmula.

export type LinhaFicha = {
  quantidade: number
  perda_percentual: number
  /** Custo do componente: `preco_custo`, ou o custo congelado se for submontado. */
  custo_unitario: number
}

/** Quantidade realmente consumida: 3 m com 5% de perda consomem 3,15 m. */
export function consumoComPerda(quantidade: number, perdaPercentual: number) {
  return quantidade * (1 + perdaPercentual / 100)
}

export function custoLinhaFicha(linha: LinhaFicha) {
  return consumoComPerda(linha.quantidade, linha.perda_percentual) * linha.custo_unitario
}

export function custoFicha(linhas: LinhaFicha[]) {
  // Arredonda só no fim, como o `round(sum(...), 2)` do banco — arredondar por
  // linha acumularia centavos de diferença em fichas longas.
  return Math.round(linhas.reduce((soma, l) => soma + custoLinhaFicha(l), 0) * 100) / 100
}
