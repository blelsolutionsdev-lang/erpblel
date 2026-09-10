import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { SignaturePad, type SignaturePadHandle } from '@/components/os/SignaturePad'
import { supabase } from '@/lib/supabase'

type OsResumo = { id: string; numero: number }

export function ConcluirOSDialog({
  os,
  onOpenChange,
}: {
  os: OsResumo | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const signatureRef = useRef<SignaturePadHandle>(null)
  const [assinaturaNome, setAssinaturaNome] = useState('')
  const [laudo, setLaudo] = useState('')
  const [fotos, setFotos] = useState<File[]>([])

  function limpar() {
    setFotos([])
    setAssinaturaNome('')
    setLaudo('')
    signatureRef.current?.clear()
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!os) throw new Error('OS inválida.')
      if (fotos.length === 0) throw new Error('Anexe pelo menos uma foto da conclusão do serviço.')
      if (!assinaturaNome.trim()) throw new Error('Informe o nome de quem assinou.')
      if (signatureRef.current?.isEmpty()) throw new Error('Colete a assinatura do cliente.')

      const assinaturaBlob = await signatureRef.current?.toBlob()
      if (!assinaturaBlob) throw new Error('Não foi possível capturar a assinatura.')

      const timestamp = Date.now()

      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i]
        const ext = foto.name.split('.').pop() || 'jpg'
        const path = `${os.id}/foto-${timestamp}-${i}.${ext}`
        const { error: upErr } = await supabase.storage.from('os-anexos').upload(path, foto)
        if (upErr) throw upErr
        const { error: insErr } = await supabase.from('os_anexos').insert({
          os_id: os.id,
          tipo: 'foto_conclusao',
          storage_path: path,
          nome_arquivo: foto.name,
        })
        if (insErr) throw insErr
      }

      const assinaturaPath = `${os.id}/assinatura-${timestamp}.png`
      const { error: sigUpErr } = await supabase.storage
        .from('os-anexos')
        .upload(assinaturaPath, assinaturaBlob, { contentType: 'image/png' })
      if (sigUpErr) throw sigUpErr

      const { error: sigInsErr } = await supabase.from('os_anexos').insert({
        os_id: os.id,
        tipo: 'assinatura_cliente',
        storage_path: assinaturaPath,
      })
      if (sigInsErr) throw sigInsErr

      const { error: updErr } = await supabase
        .from('ordens_servico')
        .update({
          status: 'concluida',
          data_conclusao: new Date().toISOString(),
          laudo_tecnico: laudo || null,
          assinatura_cliente_nome: assinaturaNome,
          assinatura_cliente_url: assinaturaPath,
          assinatura_em: new Date().toISOString(),
        })
        .eq('id', os.id)
      if (updErr) throw updErr
    },
    onSuccess: () => {
      toast.success('OS concluída — conta a receber gerada automaticamente.')
      queryClient.invalidateQueries({ queryKey: ['ordens_servico'] })
      queryClient.invalidateQueries({ queryKey: ['contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      limpar()
      onOpenChange(false)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <Dialog
      open={!!os}
      onOpenChange={(v) => {
        if (!v) limpar()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Concluir OS {os ? `#${os.numero}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="laudo">Laudo técnico</Label>
            <Textarea
              id="laudo"
              rows={3}
              placeholder="O que foi feito, peças trocadas, observações..."
              value={laudo}
              onChange={(e) => setLaudo(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fotos">Fotos da conclusão (obrigatório)</Label>
            <Input
              id="fotos"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
            />
            {fotos.length > 0 && (
              <p className="text-xs text-muted-foreground">{fotos.length} arquivo(s) selecionado(s)</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Assinatura do cliente (obrigatório)</Label>
            <SignaturePad ref={signatureRef} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assinatura_nome">Nome de quem assinou</Label>
            <Input
              id="assinatura_nome"
              value={assinaturaNome}
              onChange={(e) => setAssinaturaNome(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Concluindo...' : 'Concluir OS'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
