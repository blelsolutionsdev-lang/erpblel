import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { Paginacao } from '@/components/Paginacao'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFiltrosUrl } from '@/hooks/use-filtros-url'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type Registro = Tables<'auditoria'> & {
  autor: Pick<Tables<'profiles'>, 'id' | 'nome'> | null
}

const TABELAS = [
  'ordens_servico',
  'ordens_servico_itens',
  'produtos',
  'servicos',
  'contas_receber',
  'contas_pagar',
  'profiles',
  'role_permissions',
  'user_permissions',
  'clientes',
  'fornecedores',
]

const acaoVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  INSERT: 'default',
  UPDATE: 'secondary',
  DELETE: 'destructive',
}

function resumirMudancas(mudancas: unknown): string {
  if (!mudancas || typeof mudancas !== 'object') return '—'
  const obj = mudancas as Record<string, unknown>

  if ('depois' in obj || 'antes' in obj) {
    const alvo = (obj.depois ?? obj.antes) as Record<string, unknown> | undefined
    if (!alvo) return '—'
    if (typeof alvo.nome === 'string') return alvo.nome
    if (typeof alvo.descricao === 'string') return alvo.descricao
    if (alvo.numero != null) return `#${alvo.numero}`
    return '—'
  }

  return Object.entries(obj)
    .slice(0, 4)
    .map(([campo, valor]) => {
      const v = valor as { de?: unknown; para?: unknown }
      const de = v?.de === null || v?.de === undefined ? '∅' : String(v.de)
      const para = v?.para === null || v?.para === undefined ? '∅' : String(v.para)
      return `${campo}: ${de.slice(0, 20)} → ${para.slice(0, 20)}`
    })
    .join(' · ')
}

/** Quem mudou o quê. Antes nada disso ficava registrado. */
export function Auditoria() {
  const { filtros, definir, pagina, setPagina, de, ate } = useFiltrosUrl({ tabela: '' })
  const { tabela } = filtros

  const {
    data: resultado,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['auditoria', tabela, pagina],
    queryFn: async () => {
      let query = supabase
        .from('auditoria')
        .select('*, autor:profiles(id, nome)', { count: 'exact' })
        .order('alterado_em', { ascending: false })
        .range(de, ate)

      if (tabela) query = query.eq('tabela', tabela)

      const { data, error, count } = await query
      if (error) throw error
      return { linhas: data as unknown as Registro[], total: count }
    },
  })

  const registros = resultado?.linhas

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Trilha de alterações das tabelas sensíveis — quem mudou, quando e o que mudou"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          items={[
            { value: 'todas', label: 'Todas as tabelas' },
            ...TABELAS.map((t) => ({ value: t, label: t })),
          ]}
          value={tabela || 'todas'}
          onValueChange={(v) => definir({ tabela: !v || v === 'todas' ? '' : v })}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as tabelas</SelectItem>
            {TABELAS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        linhas={registros}
        carregando={isLoading}
        chave={(r) => String(r.id)}
        vazio="Nenhum registro de auditoria ainda."
        colunas={[
          {
            titulo: 'O que mudou',
            mobile: 'titulo',
            celula: (r) => (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={acaoVariant[r.acao] ?? 'secondary'}>{r.acao}</Badge>
                  <span className="text-sm text-muted-foreground">{r.tabela}</span>
                </div>
                <div className="truncate text-xs" title={JSON.stringify(r.mudancas)}>
                  {resumirMudancas(r.mudancas)}
                </div>
              </div>
            ),
          },
          { titulo: 'Quando', celula: (r) => formatDateTime(r.alterado_em) },
          { titulo: 'Quem', celula: (r) => r.autor?.nome ?? 'Sistema' },
        ]}
      />

      <Paginacao
        pagina={pagina}
        setPagina={setPagina}
        total={resultado?.total}
        carregando={isFetching}
      />
    </div>
  )
}
