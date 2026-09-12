import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useConfirmacao } from '@/components/ConfirmDialog'

function TelaComAcaoDestrutiva({ aoExcluir }: { aoExcluir: () => void }) {
  const { pedirConfirmacao, dialogoConfirmacao } = useConfirmacao()
  return (
    <>
      {dialogoConfirmacao}
      <button
        type="button"
        onClick={() =>
          pedirConfirmacao({
            titulo: 'Excluir equipamento',
            descricao: 'Não dá para desfazer.',
            destrutivo: true,
            rotuloConfirmar: 'Excluir',
            aoConfirmar: aoExcluir,
          })
        }
      >
        Excluir
      </button>
    </>
  )
}

describe('confirmação de ação destrutiva', () => {
  it('não executa nada só por clicar no botão', async () => {
    // O comportamento antigo: um clique e o registro sumia.
    const aoExcluir = vi.fn()
    render(<TelaComAcaoDestrutiva aoExcluir={aoExcluir} />)

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }))

    expect(screen.getByText('Excluir equipamento')).toBeInTheDocument()
    expect(aoExcluir).not.toHaveBeenCalled()
  })

  it('executa depois de confirmar', async () => {
    const aoExcluir = vi.fn()
    render(<TelaComAcaoDestrutiva aoExcluir={aoExcluir} />)

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialogo = screen.getByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

    expect(aoExcluir).toHaveBeenCalledTimes(1)
  })

  it('desiste sem executar quando o usuário cancela', async () => {
    const aoExcluir = vi.fn()
    render(<TelaComAcaoDestrutiva aoExcluir={aoExcluir} />)

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialogo = screen.getByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    expect(aoExcluir).not.toHaveBeenCalled()
  })
})
