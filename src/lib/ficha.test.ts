import { describe, expect, it } from 'vitest'
import { consumoComPerda, custoFicha, custoLinhaFicha, faltanteDe, necessidadeDe } from '@/lib/ficha'

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

describe('explosão de kit', () => {
  it('reproduz o exemplo do cadastro', () => {
    // Produzir 10 do Kit Aquecedor X: 2 curvas, 1 registro e 4 conexões por kit.
    expect(necessidadeDe(10, 2)).toBe(20)
    expect(necessidadeDe(10, 1)).toBe(10)
    expect(necessidadeDe(10, 4)).toBe(40)

    // Disponível: 16 curvas, 15 registros, 32 conexões.
    expect(faltanteDe(20, 16)).toBe(4)
    expect(faltanteDe(10, 15)).toBe(0)
    expect(faltanteDe(40, 32)).toBe(8)
  })

  it('a perda prevista entra na necessidade', () => {
    // 3 m de tubo com 5% por kit, 4 kits: 3 × 1,05 × 4 = 12,6.
    expect(necessidadeDe(4, 3, 5)).toBeCloseTo(12.6, 4)
  })

  it('sobra não vira faltante negativo', () => {
    expect(faltanteDe(3, 10)).toBe(0)
  })

  it('sem nada disponível, falta tudo', () => {
    expect(faltanteDe(7, 0)).toBe(7)
  })

  it('disponível negativo (mais reservado que saldo) não reduz a falta', () => {
    // A view pode devolver disponível negativo quando a reserva passa do saldo.
    expect(faltanteDe(5, -2)).toBe(7)
  })
})
