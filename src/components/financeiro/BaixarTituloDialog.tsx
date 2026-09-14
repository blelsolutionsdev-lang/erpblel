import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mensagemErro } from '@/lib/erros'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export type TituloParaBaixa = {
  id: string
  descricao: string
  valor: number
  valor_pago: number
}

const FORMAS = ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência']

/**
 * Baixa de título com valor parcial, juros e desconto — e lançamento
 * automático no caixa. Antes só existia "marcar como pago" pelo valor cheio.
 */
export function BaixarTituloDialog({
  tipo,
  titulo,
  onOpenChange,
}: {
  tipo: 'receber' | 'pagar'
  titulo: TituloParaBaixa | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [valor, setValor] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [forma, setForma] = useState('')
  const [juros, setJuros] = useState('0')
  const [desconto, setDesconto] = useState('0')

  const saldo = titulo
    ? titulo.valor - titulo.valor_pago + (Number(juros) || 0) - (Number(desconto) || 0)
    : 0

  useEffect(() => {
    if (titulo) {
      setValor(String((titulo.valor - titulo.valor_pago).toFixed(2)))
      setData(new Date().toISOString().slice(0, 10))
      setForma('')
      setJuros('0')
      setDesconto('0')
    }
  }, [titulo])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!titulo) throw new Error('Título inválido.')
      const valorNum = Number(valor)
      if (!Number.isFinite(valorNum) || valorNum <= 0) throw new Error('Informe um valor válido.')

      const { error } = await supabase.rpc('baixar_titulo', {
        p_tipo: tipo,
        p_titulo_id: titulo.id,
        p_valor: valorNum,
        p_data: data,
        p_forma_pagamento: forma || undefined,
        p_juros: Number(juros) || 0,
        p_desconto: Number(desconto) || 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(tipo === 'receber' ? 'Recebimento registrado.' : 'Pagamento registrado.')
      queryClient.invalidateQueries({ queryKey: ['contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['contas_pagar'] })
      queryClient.invalidateQueries({ queryKey: ['caixa'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(false)
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  return (
    <Dialog open={!!titulo} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tipo === 'receber' ? 'Registrar recebimento' : 'Registrar pagamento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{titulo?.descricao}</p>
            <div className="mt-1 flex justify-between text-muted-foreground">
              <span>Valor do título</span>
              <span>{formatCurrency(titulo?.valor)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Já {tipo === 'receber' ? 'recebido' : 'pago'}</span>
              <span>{formatCurrency(titulo?.valor_pago)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Saldo em aberto</span>
              <span>{formatCurrency(saldo)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="baixa_valor">Valor</Label>
              <Input
                id="baixa_valor"
                type="number"
                step="0.01"
                min={0}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Menor que o saldo = baixa parcial; o título continua em aberto.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="baixa_data">Data</Label>
              <Input
                id="baixa_data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="baixa_juros">Juros/multa</Label>
              <Input
                id="baixa_juros"
                type="number"
                step="0.01"
                min={0}
                value={juros}
                onChange={(e) => setJuros(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baixa_desconto">Desconto</Label>
              <Input
                id="baixa_desconto"
                type="number"
                step="0.01"
                min={0}
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="baixa_forma">Forma de pagamento</Label>
            <Input
              id="baixa_forma"
              list="formas-pagamento"
              value={forma}
              onChange={(e) => setForma(e.target.value)}
              placeholder="PIX, dinheiro, cartão..."
            />
            <datalist id="formas-pagamento">
              {FORMAS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Registrando...' : 'Registrar e lançar no caixa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
