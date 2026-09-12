import { describe, expect, it } from 'vitest'
import { custoOrdem, custoUnitarioProduzido } from '@/lib/producao'

describe('custo da ordem de produção', () => {
  it('reproduz a ordem verificada no banco', () => {
    // OP de 10 aquecedores: 2 curvas (R$10) e 1 registro (R$50) por unidade.
    // Consumiu 20 curvas com 3 de perda, e 10 registros. 9 boas, 1 refugada.
    const consumos = [
      { consumido: 20, perdido: 3, custo_unitario: 10 },
      { consumido: 10, perdido: 0, custo_unitario: 50 },
    ]
    expect(custoOrdem(consumos)).toBe(730)
    expect(custoUnitarioProduzido(730, 9)).toBe(81.11)
  })

  it('a perda do componente entra no custo', () => {
    const semPerda = custoOrdem([{ consumido: 10, perdido: 0, custo_unitario: 7 }])
    const comPerda = custoOrdem([{ consumido: 10, perdido: 2, custo_unitario: 7 }])
    expect(comPerda).toBeGreaterThan(semPerda)
    expect(comPerda - semPerda).toBeCloseTo(14)
  })

  it('a unidade refugada encarece as boas', () => {
    // Mesmo consumo, menos unidades boas: cada uma absorve mais.
    expect(custoUnitarioProduzido(1000, 10)).toBe(100)
    expect(custoUnitarioProduzido(1000, 8)).toBe(125)
  })

  it('ordem sem unidade boa não divide por zero', () => {
    expect(custoUnitarioProduzido(500, 0)).toBe(0)
  })

  it('ordem sem componentes custa zero', () => {
    expect(custoOrdem([])).toBe(0)
  })

  it('arredonda só no fim, como o banco', () => {
    const consumos = [
      { consumido: 1, perdido: 0, custo_unitario: 0.115 },
      { consumido: 1, perdido: 0, custo_unitario: 0.115 },
      { consumido: 1, perdido: 0, custo_unitario: 0.115 },
    ]
    expect(custoOrdem(consumos)).toBe(0.35)
  })
})
