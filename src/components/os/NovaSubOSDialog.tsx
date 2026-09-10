import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'

type OsOrigem = { id: string; numero: number; cliente_id: string; equipamento_id: string | null }

export function NovaSubOSDialog({
  os,
  onOpenChange,
}: {
  os: OsOrigem | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [problema, setProblema] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      if (!os) throw new Error('OS de origem inválida.')
      if (!problema.trim()) throw new Error('Descreva o problema relatado do retorno em garantia.')

      const { error } = await supabase.from('ordens_servico').insert({
        cliente_id: os.cliente_id,
        equipamento_id: os.equipamento_id,
        problema_relatado: problema,
        os_origem_id: os.id,
        eh_garantia: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Sub-OS de garantia aberta.')
      queryClient.invalidateQueries({ queryKey: ['ordens_servico'] })
      setProblema('')
      onOpenChange(false)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <Dialog open={!!os} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir sub-OS de garantia {os ? `(origem #${os.numero})` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="problema-garantia">Problema relatado</Label>
          <Textarea
            id="problema-garantia"
            rows={3}
            placeholder="O que motivou o retorno em garantia..."
            value={problema}
            onChange={(e) => setProblema(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Herda cliente e equipamento da OS de origem. Fica marcada como serviço corretivo em
            garantia e linkada à OS original.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Abrindo...' : 'Abrir sub-OS'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
