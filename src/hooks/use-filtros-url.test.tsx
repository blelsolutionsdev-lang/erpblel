import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useFiltrosUrl } from '@/hooks/use-filtros-url'

function Tela() {
  const { filtros, definir, pagina, setPagina } = useFiltrosUrl({ q: '', status: '' })
  const { search } = useLocation()

  return (
    <div>
      <span data-testid="q">{filtros.q || '(vazio)'}</span>
      <span data-testid="status">{filtros.status || '(vazio)'}</span>
      <span data-testid="pagina">{pagina}</span>
      <span data-testid="url">{search || '(sem querystring)'}</span>
      <button type="button" onClick={() => definir({ q: 'compressor' })}>
        Buscar compressor
      </button>
      <button type="button" onClick={() => definir({ status: 'concluida' })}>
        Filtrar concluídas
      </button>
      <button type="button" onClick={() => setPagina(2)}>
        Ir para página 2
      </button>
    </div>
  )
}

function renderizar(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Tela />
    </MemoryRouter>,
  )
}

describe('filtros na URL', () => {
  it('lê o estado inicial da querystring', () => {
    // É o que faz um link compartilhado abrir na mesma lista.
    renderizar('/?q=motor&status=aberta&pagina=3')
    expect(screen.getByTestId('q')).toHaveTextContent('motor')
    expect(screen.getByTestId('status')).toHaveTextContent('aberta')
    expect(screen.getByTestId('pagina')).toHaveTextContent('3')
  })

  it('escreve o filtro na URL', async () => {
    renderizar()
    await userEvent.click(screen.getByRole('button', { name: 'Buscar compressor' }))
    expect(screen.getByTestId('url')).toHaveTextContent('q=compressor')
  })

  it('volta para a primeira página ao trocar de filtro', async () => {
    // Sem isso, filtrar na página 3 mostrava uma lista vazia.
    renderizar('/?pagina=3')
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar concluídas' }))
    expect(screen.getByTestId('pagina')).toHaveTextContent('0')
    expect(screen.getByTestId('url')).toHaveTextContent('status=concluida')
  })

  it('mantém o filtro ao trocar de página', async () => {
    renderizar('/?q=motor')
    await userEvent.click(screen.getByRole('button', { name: 'Ir para página 2' }))
    expect(screen.getByTestId('q')).toHaveTextContent('motor')
    expect(screen.getByTestId('pagina')).toHaveTextContent('2')
  })

  it('não polui a URL com valores padrão', () => {
    renderizar()
    expect(screen.getByTestId('url')).toHaveTextContent('(sem querystring)')
  })
})
