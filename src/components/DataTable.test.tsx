import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataTable } from '@/components/DataTable'

type Linha = { id: string; nome: string; valor: string }

const linhas: Linha[] = [
  { id: '1', nome: 'Compressor', valor: 'R$ 450,00' },
  { id: '2', nome: 'Gás refrigerante', valor: 'R$ 410,00' },
]

const colunas = [
  { titulo: 'Produto', mobile: 'titulo' as const, celula: (l: Linha) => l.nome },
  { titulo: 'Valor', celula: (l: Linha) => l.valor },
]

describe('DataTable', () => {
  it('renderiza cada linha nas duas apresentações (cartão e tabela)', () => {
    render(<DataTable linhas={linhas} colunas={colunas} chave={(l) => l.id} vazio="vazio" />)

    // Uma vez no cartão (celular) e uma na tabela (desktop): o CSS decide qual
    // fica visível, mas os dados precisam existir nos dois.
    expect(screen.getAllByText('Compressor')).toHaveLength(2)
    expect(screen.getAllByText('R$ 410,00')).toHaveLength(2)
  })

  it('mostra as ações de cada linha', () => {
    render(
      <DataTable
        linhas={linhas}
        colunas={colunas}
        chave={(l) => l.id}
        vazio="vazio"
        acoes={(l) => <button type="button">Editar {l.nome}</button>}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Editar Compressor' })).toHaveLength(2)
  })

  it('mostra o estado vazio quando não há linhas', () => {
    render(
      <DataTable linhas={[]} colunas={colunas} chave={(l) => l.id} vazio="Nada cadastrado ainda." />,
    )
    expect(screen.getByText('Nada cadastrado ainda.')).toBeInTheDocument()
    expect(screen.queryByText('Compressor')).not.toBeInTheDocument()
  })

  it('não mostra o estado vazio enquanto carrega', () => {
    render(
      <DataTable
        linhas={undefined}
        colunas={colunas}
        chave={(l) => l.id}
        vazio="Nada cadastrado ainda."
        carregando
      />,
    )
    expect(screen.queryByText('Nada cadastrado ainda.')).not.toBeInTheDocument()
  })
})
