import { describe, expect, it } from 'vitest'
import {
  cnpjValido,
  cpfCnpjValido,
  cpfValido,
  formatarCep,
  formatarCpfCnpj,
  formatarTelefone,
  telefoneValido,
} from '@/lib/documentos'

describe('máscaras', () => {
  it('formata CPF conforme o usuário digita', () => {
    expect(formatarCpfCnpj('123')).toBe('123')
    expect(formatarCpfCnpj('12345678')).toBe('123.456.78')
    expect(formatarCpfCnpj('52998224725')).toBe('529.982.247-25')
  })

  it('vira CNPJ a partir do 12º dígito', () => {
    expect(formatarCpfCnpj('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('formata telefone fixo e celular', () => {
    expect(formatarTelefone('1133334444')).toBe('(11) 3333-4444')
    expect(formatarTelefone('11988887777')).toBe('(11) 98888-7777')
  })

  it('formata CEP', () => {
    expect(formatarCep('01310930')).toBe('01310-930')
  })
})

describe('validação de documento', () => {
  it('aceita CPF válido e recusa dígito verificador errado', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('529.982.247-24')).toBe(false)
  })

  it('recusa CPF com todos os dígitos iguais', () => {
    expect(cpfValido('111.111.111-11')).toBe(false)
  })

  it('aceita CNPJ válido e recusa dígito verificador errado', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11.222.333/0001-82')).toBe(false)
  })

  it('campo vazio é válido, mas número solto não', () => {
    // É o caso que quebrava o de-para da NF-e: "123" era aceito como CNPJ.
    expect(cpfCnpjValido('')).toBe(true)
    expect(cpfCnpjValido(null)).toBe(true)
    expect(cpfCnpjValido('123')).toBe(false)
  })

  it('telefone precisa ter 10 ou 11 dígitos', () => {
    expect(telefoneValido('')).toBe(true)
    expect(telefoneValido('(11) 98888-7777')).toBe(true)
    expect(telefoneValido('1198')).toBe(false)
  })
})
