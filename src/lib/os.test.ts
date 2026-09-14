import { describe, expect, it } from 'vitest'
import { diasAtraso, garantiaVigente, osEmAberto, statusLabel, statusManuais } from '@/lib/os'

function emDias(dias: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

describe('estados da OS', () => {
  it('orçamento e reprovada contam como OS em aberto', () => {
    expect(osEmAberto('orcamento')).toBe(true)
    expect(osEmAberto('aguardando_peca')).toBe(true)
    expect(osEmAberto('concluida')).toBe(false)
    expect(osEmAberto('cancelada')).toBe(false)
    expect(osEmAberto('reprovada')).toBe(false)
  })

  it('todo status do enum tem rótulo', () => {
    // Um status novo sem rótulo apareceria como vazio na tela.
    for (const status of Object.keys(statusLabel)) {
      expect(statusLabel[status as keyof typeof statusLabel]).toBeTruthy()
    }
  })

  it('o seletor manual não oferece orçamento nem reprovada', () => {
    // Esses dois só mudam pelas RPCs de orçamento, que registram quem aprovou.
    expect(statusManuais).not.toContain('orcamento')
    expect(statusManuais).not.toContain('reprovada')
  })
})

describe('prazo e garantia', () => {
  it('conta atraso só para OS ainda aberta', () => {
    expect(diasAtraso(emDias(-3), 'em_andamento')).toBe(3)
    expect(diasAtraso(emDias(-3), 'concluida')).toBe(0)
    expect(diasAtraso(emDias(2), 'em_andamento')).toBe(0)
    expect(diasAtraso(null, 'em_andamento')).toBe(0)
  })

  it('garantia vale até o último dia', () => {
    expect(garantiaVigente(emDias(0))).toBe(true)
    expect(garantiaVigente(emDias(1))).toBe(true)
    expect(garantiaVigente(emDias(-1))).toBe(false)
    expect(garantiaVigente(null)).toBe(false)
  })
})
