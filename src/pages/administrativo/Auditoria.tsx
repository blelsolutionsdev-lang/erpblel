import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Paginacao, usePaginacao } from '@/components/Paginacao'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  const [tabela, setTabela] = useState('')
  const { pagina, setPagina, de, ate } = usePaginacao(tabela)

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
          onValueChange={(v) => setTabela(!v || v === 'todas' ? '' : v)}
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Quando</TableHead>
              <TableHead>Quem</TableHead>
              <TableHead>Tabela</TableHead>
              <TableHead className="w-24">Ação</TableHead>
              <TableHead>O que mudou</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && registros?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum registro de auditoria ainda.
                </TableCell>
              </TableRow>
            )}

            {registros?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDateTime(r.alterado_em)}
                </TableCell>
                <TableCell className="text-sm">{r.autor?.nome ?? 'Sistema'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.tabela}</TableCell>
                <TableCell>
                  <Badge variant={acaoVariant[r.acao] ?? 'secondary'}>{r.acao}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate text-xs" title={JSON.stringify(r.mudancas)}>
                  {resumirMudancas(r.mudancas)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Paginacao
        pagina={pagina}
        setPagina={setPagina}
        total={resultado?.total}
        carregando={isFetching}
      />
    </div>
  )
}
