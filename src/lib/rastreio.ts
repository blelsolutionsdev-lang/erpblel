// Situação da validade de um lote.
//
// A regra vive aqui, e não dentro da tela, porque ela vai reaparecer no alerta
// de "garantia/validade próxima do vencimento" e num relatório de estoque
// parado — três lugares decidindo "o que é perto de vencer" por conta própria
// é o caminho para três respostas diferentes.

export type SituacaoValidade = { texto: string; critico: boolean } | null

/** Dias antes do vencimento em que o lote já entra em alerta. */
export const DIAS_ALERTA_VALIDADE = 30

const UM_DIA = 86_400_000

export function situacaoValidade(
  validade: string | null | undefined,
  hoje: Date = new Date(),
): SituacaoValidade {
  if (!validade) return null

  // A validade é uma data (sem hora): comparar em UTC evita que o fuso jogue o
  // vencimento para o dia anterior à noite.
  const alvo = Date.parse(`${validade}T00:00:00Z`)
  if (Number.isNaN(alvo)) return null

  const referencia = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
  const dias = Math.round((alvo - referencia) / UM_DIA)

  if (dias < 0) return { texto: 'vencido', critico: true }
  if (dias === 0) return { texto: 'vence hoje', critico: true }
  if (dias <= DIAS_ALERTA_VALIDADE) return { texto: `vence em ${dias}d`, critico: false }
  return null
}
