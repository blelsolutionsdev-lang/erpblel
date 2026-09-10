import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export function MatrizPermissoesPapel() {
  const queryClient = useQueryClient()

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('*').order('nome')
      if (error) throw error
      return data as Tables<'roles'>[]
    },
  })

  const { data: permissoes } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('permissions').select('*').order('modulo, chave')
      if (error) throw error
      return data as Tables<'permissions'>[]
    },
  })

  const { data: rolePermissions } = useQuery({
    queryKey: ['role_permissions_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('role_permissions').select('role_id, permission_id')
      if (error) throw error
      return data as Tables<'role_permissions'>[]
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({
      roleId,
      permissionId,
      marcado,
    }: {
      roleId: string
      permissionId: string
      marcado: boolean
    }) => {
      if (marcado) {
        const { error } = await supabase.from('role_permissions').insert({ role_id: roleId, permission_id: permissionId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId)
          .eq('permission_id', permissionId)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['role_permissions_all'] }),
    onError: (error: Error) => toast.error(error.message),
  })

  if (!roles || !permissoes) return null

  const marcados = new Set(rolePermissions?.map((rp) => `${rp.role_id}:${rp.permission_id}`))

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Permissão</TableHead>
            {roles.map((r) => (
              <TableHead key={r.id} className="text-center capitalize">
                {r.nome}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissoes.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <div className="text-sm">{p.chave}</div>
                <div className="text-xs text-muted-foreground">{p.descricao}</div>
              </TableCell>
              {roles.map((r) => {
                const key = `${r.id}:${p.id}`
                const marcado = marcados.has(key)
                return (
                  <TableCell key={r.id} className="text-center">
                    <input
                      type="checkbox"
                      className="size-4 cursor-pointer accent-primary"
                      checked={marcado}
                      onChange={(e) =>
                        toggleMutation.mutate({ roleId: r.id, permissionId: p.id, marcado: e.target.checked })
                      }
                    />
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
