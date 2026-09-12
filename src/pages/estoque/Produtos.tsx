import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Pencil, Plus, Scale, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Paginacao, usePaginacao } from '@/components/Paginacao'
import { KitComposicao } from '@/components/estoque/KitComposicao'
import { Badge } from '@/components/ui/badge'
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
import { useDebounce } from '@/hooks/use-debounce'
import { useAuth } from '@/lib/auth'
import { mensagemErro } from '@/lib/erros'
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
  estoque_inicial: z.coerce.number().min(0),
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
  estoque_inicial: 0,
  estoque_minimo: 0,
}

export function Produtos() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Produto | null>(null)
  const [ajustando, setAjustando] = useState<Produto | null>(null)
  const [novoSaldo, setNovoSaldo] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebounce(busca)
  const { pagina, setPagina, de, ate } = usePaginacao(buscaDebounced)

  const podeGerenciar = hasPermission('estoque.produtos.gerenciar')

  // Saldo comprometido em OS abertas vem da view: sem isso duas OS prometiam a
  // mesma peça e a segunda quebrava só na hora de concluir.
  const { data: comprometido } = useQuery({
    queryKey: ['produtos-comprometido'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_produtos_estoque')
        .select('id, estoque_comprometido')
        .gt('estoque_comprometido', 0)
      if (error) throw error
      const mapa = new Map<string, number>()
      for (const linha of data ?? []) {
        if (linha.id) mapa.set(linha.id, Number(linha.estoque_comprometido ?? 0))
      }
      return mapa
    },
  })

  const {
    data: resultado,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['produtos', buscaDebounced, pagina],
    queryFn: async () => {
      let query = supabase
        .from('produtos')
        .select('*, categoria:categorias_produtos(*), unidade:unidades_medida(*)', { count: 'exact' })
        .order('nome')
        .range(de, ate)

      const termo = buscaDebounced.trim()
      if (termo) {
        query = query.or(
          `nome.ilike.%${termo}%,sku.ilike.%${termo}%,codigo_barras.ilike.%${termo}%,ncm.ilike.%${termo}%`,
        )
      }

      const { data, error, count } = await query
      if (error) throw error
      return { linhas: data as Produto[], total: count }
    },
  })

  const produtos = resultado?.linhas

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
        estoque_inicial: 0,
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
        estoque_minimo: values.tipo === 'kit' ? 0 : values.estoque_minimo,
      }

      if (editing) {
        // estoque_atual não entra no update: ele é derivado das movimentações.
        // Mandar o valor do formulário de volta (que era o comportamento
        // antigo) desfazia entradas feitas por outra pessoa no meio tempo.
        const { error } = await supabase.from('produtos').update(payload).eq('id', editing.id)
        if (error) throw error
        return
      }

      const { data, error } = await supabase.from('produtos').insert(payload).select('id').single()
      if (error) throw error

      // Estoque inicial vira um lançamento de ajuste, para o saldo sempre ter
      // rastro em Movimentações.
      if (values.tipo === 'simples' && values.estoque_inicial > 0) {
        const { error: ajusteErr } = await supabase.rpc('ajustar_estoque', {
          p_produto_id: data.id,
          p_novo_saldo: values.estoque_inicial,
          p_observacao: 'Estoque inicial do cadastro',
        })
        if (ajusteErr) throw ajusteErr
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Produto atualizado.' : 'Produto cadastrado.')
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      queryClient.invalidateQueries({ queryKey: ['movimentacoes_estoque'] })
      queryClient.invalidateQueries({ queryKey: ['produtos-comprometido'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setOpen(false)
      setEditing(null)
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  const ajusteMutation = useMutation({
    mutationFn: async () => {
      if (!ajustando) throw new Error('Produto inválido.')
      const saldo = Number(novoSaldo)
      if (!Number.isFinite(saldo) || saldo < 0) throw new Error('Informe um saldo válido.')

      const { error } = await supabase.rpc('ajustar_estoque', {
        p_produto_id: ajustando.id,
        p_novo_saldo: saldo,
        p_observacao: motivoAjuste || 'Ajuste manual de saldo',
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Estoque ajustado e registrado em Movimentações.')
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      queryClient.invalidateQueries({ queryKey: ['movimentacoes_estoque'] })
      queryClient.invalidateQueries({ queryKey: ['produtos-comprometido'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setAjustando(null)
      setNovoSaldo('')
      setMotivoAjuste('')
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
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
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(produto: Produto) {
    setEditing(produto)
    setOpen(true)
  }

  function abrirAjuste(produto: Produto) {
    setAjustando(produto)
    setNovoSaldo(String(produto.estoque_atual))
    setMotivoAjuste('')
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
          podeGerenciar && (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              Novo produto
            </Button>
          )
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, SKU, código de barras ou NCM..."
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>NCM/CEST</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead>Preço de venda</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28" />
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
                  {buscaDebounced
                    ? 'Nenhum produto encontrado para essa busca.'
                    : 'Nenhum produto cadastrado ainda.'}
                </TableCell>
              </TableRow>
            )}

            {produtos?.map((produto) => {
              const abaixoMinimo = produto.estoque_atual < produto.estoque_minimo
              const reservado = comprometido?.get(produto.id) ?? 0
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
                      <div>
                        <div className="flex items-center gap-1.5">
                          {abaixoMinimo && <AlertTriangle className="size-3.5 text-amber-500" />}
                          <span className={abaixoMinimo ? 'font-medium text-amber-600' : ''}>
                            {produto.estoque_atual} {produto.unidade?.sigla ?? ''}
                          </span>
                        </div>
                        {reservado > 0 && (
                          <div className="text-[11px] text-muted-foreground">
                            {reservado} em OS aberta · {produto.estoque_atual - reservado} livre
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{formatCurrency(produto.preco_venda)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={produto.ativo ? 'default' : 'secondary'}
                      className={podeGerenciar ? 'cursor-pointer' : ''}
                      onClick={() => podeGerenciar && toggleAtivoMutation.mutate(produto)}
                    >
                      {produto.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {podeGerenciar && produto.tipo === 'simples' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Ajustar estoque"
                          onClick={() => abrirAjuste(produto)}
                        >
                          <Scale className="size-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={podeGerenciar ? 'Editar' : 'Ver'}
                        onClick={() => openEdit(produto)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Paginacao
        pagina={pagina}
        setPagina={setPagina}
        total={resultado?.total}
        carregando={isFetching}
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setEditing(null)
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? (podeGerenciar ? 'Editar produto' : editing.nome) : 'Novo produto'}
            </DialogTitle>
          </DialogHeader>
          <form
            id="produto-form"
            className="space-y-4"
            onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
          >
            <fieldset disabled={!podeGerenciar} className="space-y-4">
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
                    disabled={!podeGerenciar}
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
                    items={
                      unidades?.map((u) => ({ value: u.id, label: `${u.sigla} — ${u.descricao}` })) ?? []
                    }
                    value={unidadeId}
                    onValueChange={(v) => setValue('unidade_id', v ?? '')}
                    disabled={!podeGerenciar}
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
                  disabled={!podeGerenciar}
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
                <div className="grid grid-cols-2 gap-4">
                  {!editing && (
                    <div className="space-y-2">
                      <Label htmlFor="estoque_inicial">Estoque inicial</Label>
                      <Input
                        id="estoque_inicial"
                        type="number"
                        step="0.001"
                        min={0}
                        {...register('estoque_inicial')}
                      />
                      <p className="text-xs text-muted-foreground">
                        Entra como lançamento de ajuste no histórico.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="estoque_minimo">Estoque mínimo</Label>
                    <Input
                      id="estoque_minimo"
                      type="number"
                      step="0.001"
                      min={0}
                      {...register('estoque_minimo')}
                    />
                  </div>
                  {editing && (
                    <div className="space-y-2">
                      <Label>Estoque atual</Label>
                      <p className="flex h-8 items-center text-sm">
                        {editing.estoque_atual} {editing.unidade?.sigla ?? ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Calculado pelas movimentações. Use o botão de ajuste na listagem para
                        corrigir o saldo.
                      </p>
                    </div>
                  )}
                </div>
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
            </fieldset>
          </form>

          {tipo === 'kit' && editing && <KitComposicao kitId={editing.id} editavel={podeGerenciar} />}
          {tipo === 'kit' && !editing && (
            <p className="text-xs text-muted-foreground">
              Salve o produto primeiro para poder adicionar os componentes do kit.
            </p>
          )}
          {podeGerenciar && (
            <DialogFooter>
              <Button type="submit" form="produto-form" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!ajustando} onOpenChange={(v) => !v && setAjustando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar estoque</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {ajustando?.nome} — saldo atual {ajustando?.estoque_atual}{' '}
              {ajustando?.unidade?.sigla ?? ''}
            </p>
            <div className="space-y-2">
              <Label htmlFor="novo_saldo">Novo saldo</Label>
              <Input
                id="novo_saldo"
                type="number"
                step="0.001"
                min={0}
                value={novoSaldo}
                onChange={(e) => setNovoSaldo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motivo_ajuste">Motivo</Label>
              <Input
                id="motivo_ajuste"
                value={motivoAjuste}
                onChange={(e) => setMotivoAjuste(e.target.value)}
                placeholder="Inventário, perda, correção..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => ajusteMutation.mutate()} disabled={ajusteMutation.isPending}>
              {ajusteMutation.isPending ? 'Ajustando...' : 'Ajustar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
