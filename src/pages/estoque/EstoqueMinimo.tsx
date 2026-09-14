import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, PackageCheck, Save, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useBuscaUrl, useFiltrosUrl } from '@/hooks/use-filtros-url'
import { useAuth } from '@/lib/auth'
import { mensagemErro } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

type LinhaEstoque = {
  id: string
  nome: string
  sku: string | null
  estoque_atual: number
  estoque_minimo: number
  estoque_comprometido: number
  estoque_disponivel: number
  unidade: string
}

type Consumo = Record<string, { saidas: number; media_mensal: number; sugestao: number }>

const DIAS_ANALISE = 90

/**
 * Cadastro do estoque mínimo de todos os produtos numa tela só.
 *
 * Antes o mínimo só existia dentro do diálogo de cada produto — e como o
 * catálogo cresce sozinho a cada NF-e (produtos nascem com mínimo zero), na
 * prática ninguém preenchia e o alerta de reposição nunca disparava.
 */
export function EstoqueMinimo() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const podeGerenciar = hasPermission('estoque.produtos.gerenciar')

  const { filtros, definir } = useFiltrosUrl({ q: '' })
  const { texto: busca, setTexto: setBusca } = useBuscaUrl(filtros.q, (q) => definir({ q }))

  // Só o que a pessoa mexeu: salvar manda apenas as alterações.
  const [rascunho, setRascunho] = useState<Record<string, string>>({})

  const { data: produtos, isLoading } = useQuery({
    queryKey: ['estoque-minimos', filtros.q],
    queryFn: async () => {
      let query = supabase
        .from('vw_produtos_estoque')
        .select('id, nome, sku, estoque_atual, estoque_minimo, estoque_comprometido, estoque_disponivel')
        .eq('ativo', true)
        .eq('tipo', 'simples')
        .order('nome')
        .limit(300)

      const termo = filtros.q.trim()
      if (termo) query = query.or(`nome.ilike.%${termo}%,sku.ilike.%${termo}%`)

      const { data, error } = await query
      if (error) throw error

      const ids = (data ?? []).map((p) => p.id).filter(Boolean) as string[]
      const { data: unidades } = ids.length
        ? await supabase.from('produtos').select('id, unidade:unidades_medida(sigla)').in('id', ids)
        : { data: [] }

      const siglas = new Map<string, string>()
      for (const linha of (unidades ?? []) as { id: string; unidade: { sigla: string } | null }[]) {
        siglas.set(linha.id, linha.unidade?.sigla ?? '')
      }

      return (data ?? []).map((p) => ({
        id: p.id as string,
        nome: p.nome as string,
        sku: p.sku,
        estoque_atual: Number(p.estoque_atual ?? 0),
        estoque_minimo: Number(p.estoque_minimo ?? 0),
        estoque_comprometido: Number(p.estoque_comprometido ?? 0),
        estoque_disponivel: Number(p.estoque_disponivel ?? 0),
        unidade: siglas.get(p.id as string) ?? '',
      })) as LinhaEstoque[]
    },
  })

  const { data: consumo } = useQuery({
    queryKey: ['consumo-produtos', DIAS_ANALISE],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('consumo_produtos', { p_dias: DIAS_ANALISE })
      if (error) throw error
      return (data ?? {}) as unknown as Consumo
    },
  })

  const salvarMutation = useMutation({
    mutationFn: async () => {
      const itens = Object.entries(rascunho)
        .map(([produto_id, valor]) => ({ produto_id, estoque_minimo: Number(valor) }))
        .filter((i) => Number.isFinite(i.estoque_minimo) && i.estoque_minimo >= 0)

      if (itens.length === 0) throw new Error('Nada para salvar.')

      const { data, error } = await supabase.rpc('definir_estoque_minimo', { p_itens: itens })
      if (error) throw error
      return data as number
    },
    onSuccess: (alterados) => {
      toast.success(
        alterados === 0
          ? 'Nenhum valor mudou.'
          : `${alterados} produto(s) com estoque mínimo atualizado.`,
      )
      setRascunho({})
      queryClient.invalidateQueries({ queryKey: ['estoque-minimos'] })
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: unknown) => toast.error(mensagemErro(error)),
  })

  function valorDe(produto: LinhaEstoque) {
    return rascunho[produto.id] ?? String(produto.estoque_minimo)
  }

  function aplicarSugestaoEmTodos() {
    if (!produtos) return
    const novo = { ...rascunho }
    let aplicados = 0

    for (const produto of produtos) {
      const sugestao = consumo?.[produto.id]?.sugestao
      if (sugestao != null && sugestao !== produto.estoque_minimo) {
        novo[produto.id] = String(sugestao)
        aplicados += 1
      }
    }

    setRascunho(novo)
    toast.success(
      aplicados === 0
        ? 'Sem histórico de saída suficiente para sugerir. Preencha manualmente.'
        : `Sugestão aplicada a ${aplicados} produto(s). Revise e salve.`,
    )
  }

  const pendentes = Object.keys(rascunho).length
  const semMinimo = produtos?.filter((p) => p.estoque_minimo <= 0).length ?? 0

  return (
    <div>
      <PageHeader
        title="Estoque mínimo"
        description="O ponto em que o produto entra na lista de reposição do dashboard. Produtos criados pela entrada de NF-e nascem com mínimo zero."
        actions={
          podeGerenciar && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={aplicarSugestaoEmTodos}>
                <Sparkles className="size-4" />
                Sugerir pelo consumo
              </Button>
              <Button onClick={() => salvarMutation.mutate()} disabled={!pendentes || salvarMutation.isPending}>
                <Save className="size-4" />
                {salvarMutation.isPending
                  ? 'Salvando...'
                  : pendentes
                    ? `Salvar ${pendentes} alteração(ões)`
                    : 'Salvar'}
              </Button>
            </div>
          )
        }
      />

      {semMinimo > 0 && (
        <Card className="mb-3">
          <CardContent className="flex items-center gap-2 py-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            <span>
              <strong>{semMinimo}</strong> produto(s) ainda sem mínimo definido — eles nunca vão
              aparecer no alerta de reposição.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="mb-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto por nome ou SKU..."
            className="pl-8"
            aria-label="Buscar produtos"
          />
        </div>
      </div>

      <DataTable
        linhas={produtos}
        carregando={isLoading}
        chave={(p) => p.id}
        vazio={
          filtros.q
            ? 'Nenhum produto encontrado para essa busca.'
            : 'Nenhum produto com controle de estoque ainda.'
        }
        colunas={[
          {
            titulo: 'Produto',
            mobile: 'titulo',
            celula: (p) => (
              <div>
                <div className="font-medium">{p.nome}</div>
                <div className="text-xs text-muted-foreground">{p.sku ?? 'sem SKU'}</div>
              </div>
            ),
          },
          {
            titulo: 'Disponível',
            alinhar: 'direita',
            celula: (p) => (
              <div>
                <span className={p.estoque_disponivel <= 0 ? 'font-medium text-destructive' : ''}>
                  {p.estoque_disponivel} {p.unidade}
                </span>
                {p.estoque_comprometido > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    {p.estoque_atual} em estoque · {p.estoque_comprometido} em OS
                  </div>
                )}
              </div>
            ),
          },
          {
            titulo: `Saída em ${DIAS_ANALISE} dias`,
            alinhar: 'direita',
            celula: (p) => {
              const c = consumo?.[p.id]
              if (!c) return <span className="text-muted-foreground">—</span>
              return (
                <div>
                  <span>{c.saidas}</span>
                  <div className="text-[11px] text-muted-foreground">{c.media_mensal}/mês</div>
                </div>
              )
            },
          },
          {
            titulo: 'Estoque mínimo',
            alinhar: 'direita',
            celula: (p) => {
              const sugestao = consumo?.[p.id]?.sugestao
              const alterado = rascunho[p.id] != null && Number(rascunho[p.id]) !== p.estoque_minimo

              return (
                <div className="flex items-center justify-end gap-1.5">
                  {sugestao != null && sugestao !== Number(valorDe(p)) && podeGerenciar && (
                    <Button
                      size="xs"
                      variant="ghost"
                      title={`Usar a sugestão pelo consumo (${sugestao})`}
                      onClick={() => setRascunho((r) => ({ ...r, [p.id]: String(sugestao) }))}
                    >
                      <Sparkles className="size-3" />
                      {sugestao}
                    </Button>
                  )}
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.001"
                    disabled={!podeGerenciar}
                    aria-label={`Estoque mínimo de ${p.nome}`}
                    className={`h-8 w-24 text-right ${alterado ? 'border-primary' : ''}`}
                    value={valorDe(p)}
                    onChange={(e) => setRascunho((r) => ({ ...r, [p.id]: e.target.value }))}
                  />
                </div>
              )
            },
          },
          {
            titulo: 'Situação',
            celula: (p) => {
              const minimo = Number(valorDe(p))
              if (!minimo) return <Badge variant="outline">sem mínimo</Badge>
              if (p.estoque_disponivel < minimo) {
                return <Badge variant="destructive">repor</Badge>
              }
              return (
                <Badge variant="secondary" className="gap-1">
                  <PackageCheck className="size-3" />
                  ok
                </Badge>
              )
            },
          },
        ]}
      />

      {podeGerenciar && pendentes > 0 && (
        <div className="sticky bottom-4 mt-3 flex justify-end">
          <Button onClick={() => salvarMutation.mutate()} disabled={salvarMutation.isPending}>
            <Save className="size-4" />
            {salvarMutation.isPending ? 'Salvando...' : `Salvar ${pendentes} alteração(ões)`}
          </Button>
        </div>
      )}
    </div>
  )
}
