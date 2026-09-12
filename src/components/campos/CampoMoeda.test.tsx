import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { CampoMoeda } from '@/components/campos/CampoMoeda'

function Formulario({ aoEnviar, inicial = 0 }: { aoEnviar: (v: number) => void; inicial?: number }) {
  const { control, handleSubmit } = useForm<{ valor: number }>({ defaultValues: { valor: inicial } })
  return (
    <form onSubmit={handleSubmit((v) => aoEnviar(v.valor))}>
      <label htmlFor="valor">Valor</label>
      <CampoMoeda id="valor" control={control} name="valor" />
      <button type="submit">Salvar</button>
    </form>
  )
}

describe('CampoMoeda', () => {
  it('mostra o valor inicial no formato brasileiro', () => {
    render(<Formulario aoEnviar={vi.fn()} inicial={1234.5} />)
    expect(screen.getByLabelText('Valor')).toHaveValue('1.234,50')
  })

  it('converte o que o usuário digita em número', async () => {
    // Este é o caso que o <input type="number"> quebrava: dígitos direto,
    // com os dois últimos virando centavos.
    const aoEnviar = vi.fn()
    render(<Formulario aoEnviar={aoEnviar} />)

    const campo = screen.getByLabelText('Valor')
    await userEvent.clear(campo)
    await userEvent.type(campo, '123456')

    expect(campo).toHaveValue('1.234,56')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoEnviar).toHaveBeenCalledWith(1234.56)
  })

  it('ignora letras e pontuação coladas pelo usuário', async () => {
    const aoEnviar = vi.fn()
    render(<Formulario aoEnviar={aoEnviar} />)

    const campo = screen.getByLabelText('Valor')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'R$ 99,90')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoEnviar).toHaveBeenCalledWith(99.9)
  })
})
