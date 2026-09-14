// Máscaras e validação dos documentos brasileiros usados no cadastro.
//
// O CNPJ é a chave que casa o fornecedor na entrada de NF-e: antes o campo era
// texto livre, então dava para salvar "123" e quebrar o de-para silenciosamente.

export function somenteDigitos(valor: string) {
  return (valor ?? '').replace(/\D/g, '')
}

export function formatarCpfCnpj(valor: string) {
  const d = somenteDigitos(valor).slice(0, 14)

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }

  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function formatarTelefone(valor: string) {
  const d = somenteDigitos(valor).slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

export function formatarCep(valor: string) {
  return somenteDigitos(valor).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')
}

function digitoVerificador(base: string, pesoInicial: number) {
  let soma = 0
  let peso = pesoInicial
  for (const char of base) {
    soma += Number(char) * peso
    peso -= 1
    if (peso < 2) peso = 9
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function cpfValido(valor: string) {
  const d = somenteDigitos(valor)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) soma += Number(d[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== Number(d[9])) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += Number(d[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  return resto === Number(d[10])
}

export function cnpjValido(valor: string) {
  const d = somenteDigitos(valor)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false

  const dv1 = digitoVerificador(d.slice(0, 12), 5)
  if (dv1 !== Number(d[12])) return false

  const dv2 = digitoVerificador(d.slice(0, 13), 6)
  return dv2 === Number(d[13])
}

/** Aceita vazio (campo opcional), CPF de 11 ou CNPJ de 14 dígitos válidos. */
export function cpfCnpjValido(valor: string | null | undefined) {
  const d = somenteDigitos(valor ?? '')
  if (d.length === 0) return true
  if (d.length === 11) return cpfValido(d)
  if (d.length === 14) return cnpjValido(d)
  return false
}

export function telefoneValido(valor: string | null | undefined) {
  const d = somenteDigitos(valor ?? '')
  return d.length === 0 || d.length === 10 || d.length === 11
}

export function cepValido(valor: string | null | undefined) {
  const d = somenteDigitos(valor ?? '')
  return d.length === 0 || d.length === 8
}
