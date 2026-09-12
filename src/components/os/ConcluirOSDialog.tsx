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
import { mensagemErro } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

type OsResumo = { id: string; numero: number }

const MAX_FOTOS = 10
const MAX_BYTES_POR_FOTO = 10 * 1024 * 1024

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
      if (fotos.length > MAX_FOTOS) throw new Error(`No máximo ${MAX_FOTOS} fotos por conclusão.`)

      const grande = fotos.find((f) => f.size > MAX_BYTES_POR_FOTO)
      if (grande) throw new Error(`A foto "${grande.name}" passa de 10 MB.`)

      const naoImagem = fotos.find((f) => !f.type.startsWith('image/'))
      if (naoImagem) throw new Error(`"${naoImagem.name}" não é uma imagem.`)

      if (!assinaturaNome.trim()) throw new Error('Informe o nome de quem assinou.')
      if (signatureRef.current?.isEmpty()) throw new Error('Colete a assinatura do cliente.')

      const assinaturaBlob = await signatureRef.current?.toBlob()
      if (!assinaturaBlob) throw new Error('Não foi possível capturar a assinatura.')

      const timestamp = Date.now()
      // Guarda o que subiu para poder desfazer se o registro no banco falhar —
      // senão sobra lixo no bucket a cada tentativa frustrada.
      const enviados: string[] = []

      async function limparUploads() {
        if (enviados.length > 0) {
          await supabase.storage.from('os-anexos').remove(enviados)
        }
      }

      try {
        const anexos: { path: string; nome: string }[] = []

        for (let i = 0; i < fotos.length; i++) {
          const foto = fotos[i]
          const ext = foto.name.split('.').pop() || 'jpg'
          const path = `${os.id}/foto-${timestamp}-${i}.${ext}`
          const { error: upErr } = await supabase.storage.from('os-anexos').upload(path, foto)
          if (upErr) throw upErr
          enviados.push(path)
          anexos.push({ path, nome: foto.name })
        }

        const assinaturaPath = `${os.id}/assinatura-${timestamp}.png`
        const { error: sigUpErr } = await supabase.storage
          .from('os-anexos')
          .upload(assinaturaPath, assinaturaBlob, { contentType: 'image/png' })
        if (sigUpErr) throw sigUpErr
        enviados.push(assinaturaPath)

        // Uma transação só: anexos + conclusão da OS. O banco ainda baixa o
        // estoque das peças e gera a conta a receber por gatilho — se faltar
        // peça, nada disso é gravado.
        const { error: rpcErr } = await supabase.rpc('concluir_os', {
          p_os_id: os.id,
          p_laudo: laudo,
          p_assinatura_nome: assinaturaNome.trim(),
          p_assinatura_path: assinaturaPath,
          p_fotos: anexos,
        })
        if (rpcErr) throw rpcErr
      } catch (err) {
        await limparUploads()
        throw err
      }
    },
    onSuccess: () => {
      toast.success('OS concluída — estoque baixado e conta a receber gerada.')
      queryClient.invalidateQueries({ queryKey: ['ordens_servico'] })
      queryClient.invalidateQueries({ queryKey: ['contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      queryClient.invalidateQueries({ queryKey: ['movimentacoes_estoque'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      limpar()
      onOpenChange(false)
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
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
            <p className="text-xs text-muted-foreground">
              {fotos.length > 0
                ? `${fotos.length} arquivo(s) selecionado(s)`
                : `Até ${MAX_FOTOS} imagens, 10 MB cada.`}
            </p>
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
