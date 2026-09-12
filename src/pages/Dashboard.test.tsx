import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from '@/pages/Dashboard'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

const rpc = vi.mocked(supabase.rpc)

type ResumoTeste = {
  total_produtos: number
  produtos_abaixo_minimo: number
  produtos_sem_saldo: number
  os_abertas: number
  ver_financeiro: boolean
  ver_valor_estoque: boolean
  valor_estoque: number | null
  total_receber: number | null
  total_pagar: number | null
  reposicao: {
    id: string
    nome: string
    unidade: string
    saldo: number
    minimo: number
    comprometido: number
    disponivel: number
    falta: number
  }[]
  ultimas_movimentacoes: {
    quando: string
    produto: string
    tipo: 'entrada' | 'saida' | 'ajuste' | 'transferencia'
    quantidade: number
    origem: string
  }[]
}

const resumoBase: ResumoTeste = {
  total_produtos: 12,
  produtos_abaixo_minimo: 2,
  produtos_sem_saldo: 1,
  os_abertas: 3,
  ver_financeiro: true,
  ver_valor_estoque: true,
  valor_estoque: 5355,
  total_receber: 1200,
  total_pagar: 2605,
  reposicao: [
    {
      id: 'p1',
      nome: 'Gás Refrigerante R410A',
      unidade: 'CX',
      saldo: 3,
      minimo: 5,
      comprometido: 2,
      disponivel: 1,
      falta: 4,
    },
    {
      id: 'p2',
      nome: 'Filtro secador',
      unidade: 'UN',
      saldo: 0,
      minimo: 4,
      comprometido: 0,
      disponivel: 0,
      falta: 4,
    },
  ],
  ultimas_movimentacoes: [
    {
      quando: '2026-09-10T17:40:30Z',
      produto: 'Compressor 1/4 HP',
      tipo: 'entrada' as const,
      quantidade: 5,
      origem: 'compra_xml',
    },
    {
      quando: '2026-09-09T12:00:00Z',
      produto: 'Gás Refrigerante R410A',
      tipo: 'saida' as const,
      quantidade: 2,
      origem: 'os_baixa',
    },
  ],
}

function renderizar(resumo: Partial<ResumoTeste> = {}) {
  rpc.mockResolvedValue({ data: { ...resumoBase, ...resumo }, error: null } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Dashboard — estoque', () => {
  beforeEach(() => rpc.mockReset())

  it('mostra o valor imobilizado e o panorama do estoque', async () => {
    renderizar()

    expect(await screen.findByText('R$ 5.355,00')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('lista o que precisa de reposição, com o que já está prometido em OS', async () => {
    // O número "2 abaixo do mínimo" sozinho não dizia quais produtos comprar.
    renderizar()

    // Espera a lista chegar (o título do cartão já existe durante o carregamento)
    // e busca dentro dela: o mesmo produto também aparece em "últimas
    // movimentações".
    const primeiro = await screen.findByRole('link', { name: 'Filtro secador' })
    const lista = within(primeiro.closest('[data-slot=card]') as HTMLElement)

    expect(lista.getByText('Gás Refrigerante R410A')).toBeInTheDocument()
    expect(lista.getByText('Filtro secador')).toBeInTheDocument()
    expect(lista.getByText('2 em OS aberta')).toBeInTheDocument()
    expect(lista.getByText('faltam 4')).toBeInTheDocument()
    expect(lista.getByText('sem saldo')).toBeInTheDocument()
  })

  it('leva para o produto ao clicar no item da lista', async () => {
    renderizar()
    const link = await screen.findByRole('link', { name: 'Filtro secador' })
    expect(link).toHaveAttribute('href', '/estoque/produtos?q=Filtro%20secador')
  })

  it('comemora quando não há nada para repor', async () => {
    renderizar({ reposicao: [], produtos_abaixo_minimo: 0, produtos_sem_saldo: 0 })
    expect(await screen.findByText(/estoque em dia/i)).toBeInTheDocument()
  })

  it('esconde dinheiro de quem não tem permissão', async () => {
    // Um técnico não precisa ver títulos nem o valor imobilizado.
    renderizar({
      ver_financeiro: false,
      ver_valor_estoque: false,
      valor_estoque: null,
      total_receber: null,
      total_pagar: null,
    })

    expect(await screen.findByText('OS em aberto')).toBeInTheDocument()
    expect(screen.queryByText('Valor em estoque')).not.toBeInTheDocument()
    expect(screen.queryByText('A receber')).not.toBeInTheDocument()
    expect(screen.queryByText('A pagar')).not.toBeInTheDocument()
    // O panorama de estoque continua visível: ele é operacional, não financeiro.
    expect(screen.getByText('Precisa de reposição')).toBeInTheDocument()
  })

  it('explica de onde vem o estoque quando não há movimentação', async () => {
    renderizar({ ultimas_movimentacoes: [] })
    expect(await screen.findByText(/nasce das entradas de NF-e/i)).toBeInTheDocument()
  })
})
