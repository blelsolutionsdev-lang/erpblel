import { describe, expect, it } from 'vitest'
import { DIAS_ALERTA_VALIDADE, situacaoValidade } from '@/lib/rastreio'

const HOJE = new Date('2026-09-12T15:00:00Z')

describe('situação da validade do lote', () => {
  it('lote sem validade não alerta', () => {
    expect(situacaoValidade(null, HOJE)).toBeNull()
    expect(situacaoValidade(undefined, HOJE)).toBeNull()
  })

  it('validade distante não alerta', () => {
    expect(situacaoValidade('2027-01-01', HOJE)).toBeNull()
  })

  it('vencido é crítico', () => {
    expect(situacaoValidade('2026-09-11', HOJE)).toEqual({ texto: 'vencido', critico: true })
  })

  it('vence hoje é crítico — ainda dá para usar, mas é hoje', () => {
    expect(situacaoValidade('2026-09-12', HOJE)).toEqual({ texto: 'vence hoje', critico: true })
  })

  it('dentro da janela de alerta mostra quantos dias faltam', () => {
    expect(situacaoValidade('2026-09-20', HOJE)).toEqual({ texto: 'vence em 8d', critico: false })
  })

  it('a borda da janela ainda alerta, o dia seguinte não', () => {
    const dentro = new Date(Date.UTC(2026, 8, 12 + DIAS_ALERTA_VALIDADE))
    const fora = new Date(Date.UTC(2026, 8, 12 + DIAS_ALERTA_VALIDADE + 1))
    expect(situacaoValidade(dentro.toISOString().slice(0, 10), HOJE)?.texto).toBe(
      `vence em ${DIAS_ALERTA_VALIDADE}d`,
    )
    expect(situacaoValidade(fora.toISOString().slice(0, 10), HOJE)).toBeNull()
  })

  it('hora do dia não muda a contagem', () => {
    // Com comparação ingênua em fuso local, 23h de um dia viravam "um dia a
    // menos" e o lote aparecia vencendo antes.
    const cedo = new Date('2026-09-12T00:30:00Z')
    const tarde = new Date('2026-09-12T23:30:00Z')
    expect(situacaoValidade('2026-09-15', cedo)).toEqual(situacaoValidade('2026-09-15', tarde))
  })

  it('data inválida não quebra a tela', () => {
    expect(situacaoValidade('nao-e-data', HOJE)).toBeNull()
  })
})
