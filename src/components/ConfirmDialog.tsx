import { type ReactNode, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type PedidoConfirmacao = {
  titulo: string
  descricao: ReactNode
  rotuloConfirmar?: string
  /**
   * Rótulo do botão que fecha sem fazer nada. Só vale a pena mudar quando a
   * ação em si é um cancelamento — "Cancelar" ao lado de "Cancelar solicitação"
   * deixa o diálogo ambíguo.
   */
  rotuloDispensar?: string
  destrutivo?: boolean
  aoConfirmar: () => void | Promise<void>
}

/**
 * Confirmação para ação que não dá para desfazer com um clique.
 *
 * Excluir equipamento, componente de kit ou categoria era imediato, e cancelar
 * uma OS — que estorna estoque e cancela o título — era só escolher um item no
 * seletor de status.
 */
export function useConfirmacao() {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const [executando, setExecutando] = useState(false)

  async function confirmar() {
    if (!pedido) return
    setExecutando(true)
    try {
      await pedido.aoConfirmar()
      setPedido(null)
    } finally {
      setExecutando(false)
    }
  }

  const dialogo = (
    <Dialog open={!!pedido} onOpenChange={(v) => !v && !executando && setPedido(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {pedido?.destrutivo && <TriangleAlert className="size-5 text-destructive" />}
            {pedido?.titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{pedido?.descricao}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPedido(null)} disabled={executando}>
            {pedido?.rotuloDispensar ?? 'Cancelar'}
          </Button>
          <Button
            variant={pedido?.destrutivo ? 'destructive' : 'default'}
            onClick={confirmar}
            disabled={executando}
          >
            {executando ? 'Aguarde...' : (pedido?.rotuloConfirmar ?? 'Confirmar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { pedirConfirmacao: setPedido, dialogoConfirmacao: dialogo }
}
