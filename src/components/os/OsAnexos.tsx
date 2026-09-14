import { useQuery } from '@tanstack/react-query'
import { FileImage, PenLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type Anexo = Tables<'os_anexos'> & { url: string | null }

/** Uma hora é tempo de sobra para abrir/imprimir e curto o bastante para o link vazar pouco. */
const VALIDADE_SEGUNDOS = 60 * 60

export function useOsAnexos(osId: string | null) {
  return useQuery({
    queryKey: ['os_anexos', osId],
    enabled: !!osId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('os_anexos')
        .select('*')
        .eq('os_id', osId!)
        .order('created_at')
      if (error) throw error

      const anexos = (data ?? []) as Tables<'os_anexos'>[]
      if (anexos.length === 0) return [] as Anexo[]

      // O bucket é privado: sem URL assinada a foto não abre em lugar nenhum —
      // era por isso que as provas de conclusão ficavam inacessíveis.
      const { data: assinadas } = await supabase.storage
        .from('os-anexos')
        .createSignedUrls(
          anexos.map((a) => a.storage_path),
          VALIDADE_SEGUNDOS,
        )

      return anexos.map((a, i) => ({ ...a, url: assinadas?.[i]?.signedUrl ?? null })) as Anexo[]
    },
  })
}

export function OsAnexos({ osId, assinanteNome }: { osId: string; assinanteNome?: string | null }) {
  const { data: anexos, isLoading } = useOsAnexos(osId)

  const fotos = anexos?.filter((a) => a.tipo === 'foto_conclusao') ?? []
  const assinatura = anexos?.find((a) => a.tipo === 'assinatura_cliente')

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (!anexos || anexos.length === 0) {
    return (
      <div className="rounded-lg border p-3 text-sm text-muted-foreground">
        Nenhum anexo — as fotos e a assinatura são coletadas na conclusão da OS.
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <FileImage className="size-4" />
        Comprovação da conclusão
      </p>

      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((foto) => (
            <a
              key={foto.id}
              href={foto.url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-md border"
              title={`${foto.nome_arquivo ?? 'Foto'} — ${formatDateTime(foto.created_at)}`}
            >
              {foto.url ? (
                <img
                  src={foto.url}
                  alt={foto.nome_arquivo ?? 'Foto da conclusão'}
                  className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
                  indisponível
                </div>
              )}
            </a>
          ))}
        </div>
      )}

      {assinatura && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PenLine className="size-3.5" />
            Assinatura {assinanteNome ? `de ${assinanteNome}` : 'do cliente'} ·{' '}
            {formatDateTime(assinatura.created_at)}
          </p>
          {assinatura.url ? (
            <img
              src={assinatura.url}
              alt="Assinatura do cliente"
              className="h-20 rounded-md border bg-white object-contain p-1"
            />
          ) : (
            <Badge variant="outline">Assinatura indisponível</Badge>
          )}
        </div>
      )}
    </div>
  )
}
