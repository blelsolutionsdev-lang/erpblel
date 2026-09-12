import { describe, expect, it } from 'vitest'
import { dashboardItem, encontrarRota, navGroups } from './nav-config'

describe('configuração do menu lateral', () => {
  it('todo item tem ícone', () => {
    // Com a barra recolhida (`collapsible="icon"`) o item vira só o ícone. Sem
    // ele o menu era uma coluna de letras cortadas: "P…", "C…", "E…", "M…".
    const semIcone = [dashboardItem, ...navGroups.flatMap((g) => g.items)]
      .filter((item) => !item.icon)
      .map((item) => item.url)

    expect(semIcone).toEqual([])
  })

  it('todo grupo tem ícone e ao menos um item', () => {
    for (const grupo of navGroups) {
      expect(grupo.icon, grupo.title).toBeTruthy()
      expect(grupo.items.length, grupo.title).toBeGreaterThan(0)
    }
  })

  it('não repete rota entre grupos', () => {
    const urls = navGroups.flatMap((g) => g.items.map((i) => i.url))
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('acha o grupo/item da rota, inclusive em subrotas', () => {
    expect(encontrarRota('/estoque/produtos').item?.title).toBe('Produtos')
    expect(encontrarRota('/estoque/produtos').grupo?.title).toBe('Estoque')
    expect(encontrarRota('/os/123').item?.title).toBe('Ordens de serviço')
    expect(encontrarRota('/rota-inexistente')).toEqual({})
  })
})
