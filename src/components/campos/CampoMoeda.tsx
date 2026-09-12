import { type FieldPath, type FieldValues, useController, type UseControllerProps } from 'react-hook-form'
import { Input } from '@/components/ui/input'

/**
 * Campo de dinheiro no formato brasileiro.
 *
 * O app inteiro usava `<input type="number">` para valores: quem digita
 * "1.234,56" (o jeito natural no teclado pt-BR) recebia campo vazio, e no
 * celular ainda aparecia o seletor de setinhas. Aqui o usuário digita só
 * dígitos e vê "1.234,56"; o formulário recebe 1234.56.
 */
export function CampoMoeda<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  id,
  disabled,
  className,
  ...props
}: UseControllerProps<TValues, TName> & {
  id?: string
  disabled?: boolean
  className?: string
}) {
  const { field, fieldState } = useController(props)

  const numero = Number(field.value ?? 0)
  const texto = (Number.isFinite(numero) ? numero : 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return (
    <>
      <Input
        id={id}
        inputMode="decimal"
        disabled={disabled}
        className={className}
        value={texto}
        onChange={(e) => {
          // Só os dígitos importam: os dois últimos são os centavos.
          const digitos = e.target.value.replace(/\D/g, '').slice(0, 13)
          field.onChange(digitos ? Number(digitos) / 100 : 0)
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={field.onBlur}
        ref={field.ref}
      />
      {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
    </>
  )
}
