import { type FieldPath, type FieldValues, useController, type UseControllerProps } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { formatarCep, formatarCpfCnpj, formatarTelefone } from '@/lib/documentos'

const MASCARAS = {
  cpfCnpj: formatarCpfCnpj,
  telefone: formatarTelefone,
  cep: formatarCep,
} as const

export type TipoMascara = keyof typeof MASCARAS

/**
 * Campo com máscara brasileira. Guarda o valor já formatado (é como o usuário
 * lê o documento); a normalização para dígitos é feita no banco, que compara
 * CNPJ sempre por `regexp_replace(..., '\D', '')`.
 */
export function CampoMascarado<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  id,
  mascara,
  placeholder,
  disabled,
  ...props
}: UseControllerProps<TValues, TName> & {
  id?: string
  mascara: TipoMascara
  placeholder?: string
  disabled?: boolean
}) {
  const { field, fieldState } = useController(props)
  const formatar = MASCARAS[mascara]

  return (
    <>
      <Input
        id={id}
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        value={formatar(String(field.value ?? ''))}
        onChange={(e) => field.onChange(formatar(e.target.value))}
        onBlur={field.onBlur}
        ref={field.ref}
      />
      {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
    </>
  )
}
