import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function abrir(largura: string) {
  render(
    <Dialog open>
      <DialogContent className={`max-h-[85vh] ${largura} overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>Editar OS</DialogTitle>
        </DialogHeader>
        <p>conteúdo</p>
        <DialogFooter>
          <button type="button">Salvar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  )
  return screen.getByRole('dialog')
}

describe('largura do diálogo', () => {
  it('respeita a largura que a tela pede', () => {
    // O padrão do componente era `sm:max-w-sm`. Como é uma variante diferente
    // do `max-w-2xl` que a tela passa, o tailwind-merge não resolvia o conflito
    // e a regra do media query ganhava: todo diálogo virava 384px acima de
    // 640px de viewport, com o conteúdo estourando em rolagem horizontal.
    const dialogo = abrir('max-w-2xl')
    expect(dialogo.className).toContain('max-w-2xl')
    expect(dialogo.className).not.toContain('sm:max-w-sm')
    expect(dialogo.className).not.toMatch(/(^|\s)max-w-sm(\s|$)/)
  })

  it('mantém o padrão quando a tela não pede largura', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole('dialog').className).toMatch(/(^|\s)max-w-sm(\s|$)/)
  })

  it('nunca passa da largura da tela', () => {
    const dialogo = abrir('max-w-lg')
    // A largura é sempre `calc(100% - 2rem)`; o max-w só limita em telas largas.
    expect(dialogo.className).toContain('w-[calc(100%-2rem)]')
  })

  it('o rodapé fixo tem fundo opaco', () => {
    // Com fundo translúcido o conteúdo passava por baixo dos botões ao rolar.
    abrir('max-w-lg')
    const rodape = document.querySelector('[data-slot=dialog-footer]')
    expect(rodape?.className).toContain('sticky')
    expect(rodape?.className).toContain('bg-popover')
    expect(rodape?.className).not.toContain('bg-muted/50')
  })
})
