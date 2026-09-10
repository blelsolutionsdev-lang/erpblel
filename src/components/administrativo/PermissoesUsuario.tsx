import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type Permission = Tables<'permissions'>
type Override = { permission_id: string; allow: boolean }

const MODULO_LABEL: Record<string, string> = {
  administrativo: 'Administrativo',
  estoque: 'Estoque',
  os: 'Ordens de serviço',
  financeiro: 'Financeiro',
  fiscal: 'Fiscal',
}

export function PermissoesUsuario({ userId, roleId }: { userId: string; roleId: string | null }) {
  const queryClient = useQueryClient()

  const { data: permissoes } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('permissions').select('*').order('modulo, chave')
      if (error) throw error
      return data as Permission[]
    },
  })

  const { data: permissoesDoPapel } = useQuery({
    queryKey: ['role_permissions', roleId],
    queryFn: async () => {
      if (!roleId) return new Set<string>()
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', roleId)
      if (error) throw error
      return new Set(data.map((r) => r.permission_id))
    },
  })

  const { data: overrides } = useQuery({
    queryKey: ['user_permissions', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('permission_id, allow')
        .eq('user_id', userId)
      if (error) throw error
      return data as Override[]
    },
  })

  const setOverrideMutation = useMutation({
    mutationFn: async ({ permissionId, allow }: { permissionId: string; allow: boolean | null }) => {
      if (allow === null) {
        const { error } = await supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('permission_id', permissionId)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from('user_permissions')
        .upsert({ user_id: userId, permission_id: permissionId, allow }, { onConflict: 'user_id,permission_id' })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user_permissions', userId] }),
    onError: (error: Error) => toast.error(error.message),
  })

  if (!permissoes) return null

  const grupos = permissoes.reduce<Record<string, Permission[]>>((acc, p) => {
    ;(acc[p.modulo] ??= []).push(p)
    return acc
  }, {})

  const overrideMap = new Map(overrides?.map((o) => [o.permission_id, o.allow]))

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">Permissões customizadas</p>
        <p className="text-xs text-muted-foreground">
          Por padrão o usuário herda as permissões do papel. Use os botões pra permitir ou negar
          uma permissão específica pra essa pessoa, independente do papel.
        </p>
      </div>

      {Object.entries(grupos).map(([modulo, lista]) => (
        <div key={modulo} className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{MODULO_LABEL[modulo] ?? modulo}</p>
          {lista.map((p) => {
            const override = overrideMap.get(p.id)
            const herdaDoPapel = permissoesDoPapel?.has(p.id) ?? false
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate" title={p.descricao ?? undefined}>
                  {p.chave}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant={override === undefined ? 'secondary' : 'ghost'}
                    onClick={() => setOverrideMutation.mutate({ permissionId: p.id, allow: null })}
                  >
                    Herdar ({herdaDoPapel ? 'sim' : 'não'})
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={override === true ? 'default' : 'ghost'}
                    onClick={() => setOverrideMutation.mutate({ permissionId: p.id, allow: true })}
                  >
                    Permitir
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={override === false ? 'destructive' : 'ghost'}
                    onClick={() => setOverrideMutation.mutate({ permissionId: p.id, allow: false })}
                  >
                    Negar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
