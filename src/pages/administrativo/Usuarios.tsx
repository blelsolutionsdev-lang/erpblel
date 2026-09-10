import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { MatrizPermissoesPapel } from '@/components/administrativo/MatrizPermissoesPapel'
import { PermissoesUsuario } from '@/components/administrativo/PermissoesUsuario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type Profile = Tables<'profiles'> & { role: Tables<'roles'> | null }

const formSchema = z.object({
  nome: z.string().min(2, 'Informe o nome'),
  email: z.string().email('E-mail inválido'),
  telefone: z.string().optional(),
  role_id: z.string().min(1, 'Selecione um papel'),
})

type FormValues = z.infer<typeof formSchema>

async function mensagemErroFuncao(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context?: Response }).context
    if (ctx instanceof Response) {
      try {
        const body = await ctx.clone().json()
        if (body?.error) return body.error as string
      } catch {
        // corpo não era JSON
      }
    }
  }
  return error instanceof Error ? error.message : 'Erro inesperado.'
}

export function Usuarios() {
  const { hasPermission, permissoesCarregadas } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null)

  const podeGerenciar = hasPermission('administrativo.usuarios.gerenciar')

  const { data: usuarios, isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, role:roles(*)')
        .order('nome')
      if (error) throw error
      return data as Profile[]
    },
  })

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('*').order('nome')
      if (error) throw error
      return data
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nome: '', email: '', telefone: '', role_id: '' },
  })

  useEffect(() => {
    if (editing) {
      reset({
        nome: editing.nome,
        email: editing.email,
        telefone: editing.telefone ?? '',
        role_id: editing.role_id ?? '',
      })
    } else {
      reset({ nome: '', email: '', telefone: '', role_id: '' })
    }
  }, [editing, reset])

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'create', email: values.email, nome: values.nome, telefone: values.telefone, role_id: values.role_id },
      })
      if (error) throw new Error(await mensagemErroFuncao(error))
      if (data?.error) throw new Error(data.error)
      return data as { user_id: string; senha_temporaria: string }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      setOpen(false)
      setSenhaGerada(data.senha_temporaria)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!editing) return
      const { error } = await supabase
        .from('profiles')
        .update({ nome: values.nome, telefone: values.telefone || null, role_id: values.role_id })
        .eq('id', editing.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Usuário atualizado.')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      setEditing(null)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const toggleAtivoMutation = useMutation({
    mutationFn: async (usuario: Profile) => {
      const { error } = await supabase.from('profiles').update({ ativo: !usuario.ativo }).eq('id', usuario.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
    onError: (error: Error) => toast.error(error.message),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'reset_password', user_id: userId },
      })
      if (error) throw new Error(await mensagemErroFuncao(error))
      if (data?.error) throw new Error(data.error)
      return data as { senha_temporaria: string }
    },
    onSuccess: (data) => setSenhaGerada(data.senha_temporaria),
    onError: (error: Error) => toast.error(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'delete', user_id: userId },
      })
      if (error) throw new Error(await mensagemErroFuncao(error))
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      toast.success('Usuário excluído.')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      setEditing(null)
      setConfirmandoExclusao(false)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  function openNew() {
    setEditing(null)
    setConfirmandoExclusao(false)
    setOpen(true)
  }

  function openEdit(usuario: Profile) {
    setEditing(usuario)
    setConfirmandoExclusao(false)
    setOpen(true)
  }

  const roleId = watch('role_id')

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Usuários com acesso ao sistema, seus papéis e permissões"
      />

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="permissoes">Permissões padrão</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-4">
          {podeGerenciar && (
            <div className="flex justify-end">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger render={<Button onClick={openNew} />}>
                  <Plus className="size-4" />
                  Novo usuário
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editing ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
                  </DialogHeader>
                  <form
                    id="usuario-form"
                    className="space-y-4"
                    onSubmit={handleSubmit((values) =>
                      editing ? updateMutation.mutate(values) : createMutation.mutate(values),
                    )}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome</Label>
                      <Input id="nome" {...register('nome')} />
                      {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" disabled={!!editing} {...register('email')} />
                      {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                      {editing && (
                        <p className="text-xs text-muted-foreground">
                          O e-mail de login não pode ser alterado por aqui.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefone">Telefone</Label>
                      <Input id="telefone" {...register('telefone')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Papel</Label>
                      <Select
                        items={roles?.map((r) => ({ value: r.id, label: r.nome })) ?? []}
                        value={roleId}
                        onValueChange={(v) => setValue('role_id', v ?? '')}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um papel" />
                        </SelectTrigger>
                        <SelectContent>
                          {roles?.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.role_id && <p className="text-xs text-destructive">{errors.role_id.message}</p>}
                    </div>
                  </form>

                  {editing && <PermissoesUsuario userId={editing.id} roleId={editing.role_id} />}

                  {editing && (
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => resetPasswordMutation.mutate(editing.id)}
                        disabled={resetPasswordMutation.isPending}
                      >
                        <KeyRound className="size-3.5" />
                        Redefinir senha
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirmandoExclusao) {
                            deleteMutation.mutate(editing.id)
                          } else {
                            setConfirmandoExclusao(true)
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="size-3.5" />
                        {confirmandoExclusao ? 'Confirmar exclusão?' : 'Excluir usuário'}
                      </Button>
                      {confirmandoExclusao && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmandoExclusao(false)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  )}

                  <DialogFooter>
                    <Button
                      type="submit"
                      form="usuario-form"
                      disabled={createMutation.isPending || updateMutation.isPending}
                    >
                      {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Status</TableHead>
                  {podeGerenciar && <TableHead className="w-16" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(isLoading || !permissoesCarregadas) &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}

                {!isLoading &&
                  usuarios?.map((usuario) => (
                    <TableRow key={usuario.id}>
                      <TableCell className="font-medium">{usuario.nome}</TableCell>
                      <TableCell>{usuario.email}</TableCell>
                      <TableCell>{usuario.role?.nome ?? '—'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={usuario.ativo ? 'default' : 'secondary'}
                          className={podeGerenciar ? 'cursor-pointer' : ''}
                          onClick={() => podeGerenciar && toggleAtivoMutation.mutate(usuario)}
                        >
                          {usuario.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      {podeGerenciar && (
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(usuario)}>
                            <Pencil className="size-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="permissoes">
          <MatrizPermissoesPapel />
        </TabsContent>
      </Tabs>

      <Dialog open={!!senhaGerada} onOpenChange={(v) => !v && setSenhaGerada(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Senha temporária gerada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Repasse essa senha pro usuário por um canal seguro — ela só é mostrada uma vez.
          </p>
          <div className="rounded-lg border bg-muted p-3 text-center font-mono text-lg tracking-wide">
            {senhaGerada}
          </div>
          <DialogFooter>
            <Button onClick={() => setSenhaGerada(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
