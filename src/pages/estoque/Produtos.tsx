import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { KitComposicao } from '@/components/estoque/KitComposicao'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

type Produto = Tables<'produtos'> & {
  categoria: Tables<'categorias_produtos'> | null
  unidade: Tables<'unidades_medida'> | null
}

const formSchema = z.object({
  nome: z.string().min(2, 'Informe o nome do produto'),
  sku: z.string().optional(),
  codigo_barras: z.string().optional(),
  descricao: z.string().optional(),
  categoria_id: z.string().optional(),
  unidade_id: z.string().optional(),
  tipo: z.enum(['simples', 'kit']),
  ncm: z.string().optional(),
  cest: z.string().optional(),
  preco_custo: z.coerce.number().min(0),
  preco_venda: z.coerce.number().min(0),
  estoque_atual: z.coerce.number().min(0),
  estoque_minimo: z.coerce.number().min(0),
})

type FormValues = z.infer<typeof formSchema>

const emptyValues: FormValues = {
  nome: '',
  sku: '',
  codigo_barras: '',
  descricao: '',
  categoria_id: '',
  unidade_id: '',
  tipo: 'simples',
  ncm: '',
  cest: '',
  preco_custo: 0,
  preco_venda: 0,
  estoque_atual: 0,
  estoque_minimo: 0,
}

export function Produtos() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Produto | null>(null)

  const { data: produtos, isLoading } = useQuery({
    queryKey: ['produtos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos')
        .select('*, categoria:categorias_produtos(*), unidade:unidades_medida(*)')
        .order('nome')
      if (error) throw error
      return data as Produto[]
    },
  })

  const { data: categorias } = useQuery({
    queryKey: ['categorias_produtos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categorias_produtos').select('*').order('nome')
      if (error) throw error
      return data
    },
  })

  const { data: unidades } = useQuery({
    queryKey: ['unidades_medida'],
    queryFn: async () => {
      const { data, error } = await supabase.from('unidades_medida').select('*').order('sigla')
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
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (editing) {
      reset({
        nome: editing.nome,
        sku: editing.sku ?? '',
        codigo_barras: editing.codigo_barras ?? '',
        descricao: editing.descricao ?? '',
        categoria_id: editing.categoria_id ?? '',
        unidade_id: editing.unidade_id ?? '',
        tipo: editing.tipo,
        ncm: editing.ncm ?? '',
        cest: editing.cest ?? '',
        preco_custo: editing.preco_custo,
        preco_venda: editing.preco_venda,
        estoque_atual: editing.estoque_atual,
        estoque_minimo: editing.estoque_minimo,
      })
    } else {
      reset(emptyValues)
    }
  }, [editing, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: TablesInsert<'produtos'> = {
        nome: values.nome,
        sku: values.sku || null,
        codigo_barras: values.codigo_barras || null,
        descricao: values.descricao || null,
        categoria_id: values.categoria_id || null,
        unidade_id: values.unidade_id || null,
        tipo: values.tipo,
        ncm: values.ncm || null,
        cest: values.cest || null,
        preco_custo: values.preco_custo,
        preco_venda: values.preco_venda,
        // Kits não têm estoque próprio: o saldo vem sempre dos componentes.
        estoque_atual: values.tipo === 'kit' ? 0 : values.estoque_atual,
        estoque_minimo: values.tipo === 'kit' ? 0 : values.estoque_minimo,
      }

      if (editing) {
        const { error } = await supabase.from('produtos').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('produtos').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Produto atualizado.' : 'Produto cadastrado.')
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setOpen(false)
      setEditing(null)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const toggleAtivoMutation = useMutation({
    mutationFn: async (produto: Produto) => {
      const { error } = await supabase
        .from('produtos')
        .update({ ativo: !produto.ativo })
        .eq('id', produto.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['produtos'] }),
    onError: (error: Error) => toast.error(error.message),
  })

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(produto: Produto) {
    setEditing(produto)
    setOpen(true)
  }

  const tipo = watch('tipo')
  const categoriaId = watch('categoria_id')
  const unidadeId = watch('unidade_id')

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Cadastro de produtos com NCM/CEST para movimentação de estoque e emissão fiscal"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button onClick={openNew} />}>
              <Plus className="size-4" />
              Novo produto
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? 'Editar produto' : 'Novo produto'}</DialogTitle>
              </DialogHeader>
              <form
                id="produto-form"
                className="space-y-4"
                onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
              >
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" {...register('nome')} />
                  {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input id="sku" {...register('sku')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="codigo_barras">Código de barras</Label>
                    <Input id="codigo_barras" {...register('codigo_barras')} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select
                      items={categorias?.map((c) => ({ value: c.id, label: c.nome })) ?? []}
                      value={categoriaId}
                      onValueChange={(v) => setValue('categoria_id', v ?? '')}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sem categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {categorias?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade</Label>
                    <Select
                      items={unidades?.map((u) => ({ value: u.id, label: `${u.sigla} — ${u.descricao}` })) ?? []}
                      value={unidadeId}
                      onValueChange={(v) => setValue('unidade_id', v ?? '')}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {unidades?.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.sigla} — {u.descricao}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    items={{ simples: 'Simples', kit: 'Kit' }}
                    value={tipo}
                    onValueChange={(v) => setValue('tipo', (v ?? 'simples') as 'simples' | 'kit')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simples">Simples</SelectItem>
                      <SelectItem value="kit">Kit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ncm">NCM</Label>
                    <Input id="ncm" maxLength={8} placeholder="00000000" {...register('ncm')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cest">CEST</Label>
                    <Input id="cest" maxLength={7} placeholder="0000000" {...register('cest')} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="preco_custo">Preço de custo</Label>
                    <Input id="preco_custo" type="number" step="0.01" min={0} {...register('preco_custo')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preco_venda">Preço de venda</Label>
                    <Input id="preco_venda" type="number" step="0.01" min={0} {...register('preco_venda')} />
                  </div>
                </div>

                {tipo === 'simples' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="estoque_atual">
                          Estoque {editing ? 'atual' : 'inicial'}
                        </Label>
                        <Input id="estoque_atual" type="number" step="0.001" min={0} {...register('estoque_atual')} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="estoque_minimo">Estoque mínimo</Label>
                        <Input id="estoque_minimo" type="number" step="0.001" min={0} {...register('estoque_minimo')} />
                      </div>
                    </div>
                    {editing && (
                      <p className="text-xs text-muted-foreground">
                        Ajustar o estoque aqui não gera registro em Movimentações — use essa tela só
                        para correções pontuais.
                      </p>
                    )}
                  </>
                )}
                {tipo === 'kit' && (
                  <p className="text-xs text-muted-foreground">
                    Kit não tem estoque próprio — o saldo disponível é calculado a partir dos
                    componentes.
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea id="descricao" rows={2} {...register('descricao')} />
                </div>
              </form>

              {tipo === 'kit' && editing && <KitComposicao kitId={editing.id} />}
              {tipo === 'kit' && !editing && (
                <p className="text-xs text-muted-foreground">
                  Salve o produto primeiro para poder adicionar os componentes do kit.
                </p>
              )}
              <DialogFooter>
                <Button type="submit" form="produto-form" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>NCM/CEST</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead>Preço de venda</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && produtos?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhum produto cadastrado ainda.
                </TableCell>
              </TableRow>
            )}

            {produtos?.map((produto) => {
              const abaixoMinimo = produto.estoque_atual < produto.estoque_minimo
              return (
                <TableRow key={produto.id}>
                  <TableCell>
                    <div className="font-medium">{produto.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {produto.sku ?? '—'} · {produto.categoria?.nome ?? 'Sem categoria'}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {produto.ncm || '—'} / {produto.cest || '—'}
                  </TableCell>
                  <TableCell>
                    {produto.tipo === 'kit' ? (
                      <Badge variant="outline">Kit</Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {abaixoMinimo && <AlertTriangle className="size-3.5 text-amber-500" />}
                        <span className={abaixoMinimo ? 'font-medium text-amber-600' : ''}>
                          {produto.estoque_atual} {produto.unidade?.sigla ?? ''}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{formatCurrency(produto.preco_venda)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={produto.ativo ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => toggleAtivoMutation.mutate(produto)}
                    >
                      {produto.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(produto)}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
