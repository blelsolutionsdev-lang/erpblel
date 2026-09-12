import { describe, expect, it } from 'vitest'
import { consumoComPerda, custoFicha, custoLinhaFicha } from '@/lib/ficha'

describe('ficha técnica — consumo com perda', () => {
  it('sem perda, consome a quantidade da ficha', () => {
    expect(consumoComPerda(3, 0)).toBe(3)
  })

  it('aplica o refugo previsto', () => {
    // O exemplo do cadastro: 3 m de tubo com 5% de perda consomem 3,15 m.
    expect(consumoComPerda(3, 5)).toBeCloseTo(3.15, 4)
  })

  it('bate com a cascata do banco para várias unidades', () => {
    // Confirmado em teste transacional: saldo 15 → 8,7 ao baixar 2 kits de um
    // componente com quantidade 3 e 5% de perda (3 × 1,05 × 2 = 6,3).
    expect(consumoComPerda(3, 5) * 2).toBeCloseTo(6.3, 4)
  })
})

describe('ficha técnica — custo', () => {
  it('custo da linha inclui a perda', () => {
    expect(custoLinhaFicha({ quantidade: 2, perda_percentual: 10, custo_unitario: 50 })).toBeCloseTo(110)
  })

  it('soma a ficha inteira e arredonda só no fim', () => {
    // Arredondar por linha daria 0,34; o banco arredonda a soma.
    const linhas = [
      { quantidade: 1, perda_percentual: 0, custo_unitario: 0.115 },
      { quantidade: 1, perda_percentual: 0, custo_unitario: 0.115 },
      { quantidade: 1, perda_percentual: 0, custo_unitario: 0.115 },
    ]
    expect(custoFicha(linhas)).toBe(0.35)
  })

  it('reproduz o custo congelado da ficha migrada', () => {
    // Kit Manutenção Preventiva v1: 1 Compressor (275) + 1 Gás R410A (410).
    const linhas = [
      { quantidade: 1, perda_percentual: 0, custo_unitario: 275 },
      { quantidade: 1, perda_percentual: 0, custo_unitario: 410 },
    ]
    expect(custoFicha(linhas)).toBe(685)
  })

  it('ficha vazia custa zero', () => {
    expect(custoFicha([])).toBe(0)
  })
})
