import type { ReactNode } from 'react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export type Coluna<T> = {
  /** Cabeçalho da tabela; no cartão vira o rótulo da linha. */
  titulo: string
  celula: (linha: T) => ReactNode
  className?: string
  /** No celular: 'titulo' vai para o topo do cartão, 'oculta' some, o resto vira par rótulo/valor. */
  mobile?: 'titulo' | 'destaque' | 'normal' | 'oculta'
  alinhar?: 'esquerda' | 'direita'
}

/**
 * Listagem que vira cartão no celular.
 *
 * Em 375px a tabela de OS mostrava 2 de 7 colunas — status, valor e todos os
 * botões ficavam fora da tela, justamente para o técnico que usa o sistema no
 * telefone.
 */
export function DataTable<T>({
  linhas,
  colunas,
  chave,
  carregando,
  vazio,
  acoes,
}: {
  linhas: T[] | undefined
  colunas: Coluna<T>[]
  chave: (linha: T) => string
  carregando?: boolean
  vazio: ReactNode
  acoes?: (linha: T) => ReactNode
}) {
  const visiveis = colunas.filter((c) => c.mobile !== 'oculta')
  const colunaTitulo = visiveis.find((c) => c.mobile === 'titulo') ?? visiveis[0]
  const demais = visiveis.filter((c) => c !== colunaTitulo)

  if (carregando) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full md:h-10" />
        ))}
      </div>
    )
  }

  if (!linhas || linhas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        {vazio}
      </div>
    )
  }

  return (
    <>
      {/* Celular: cartões */}
      <div className="space-y-2 md:hidden">
        {linhas.map((linha) => (
          <div key={chave(linha)} className="rounded-lg border p-3">
            <div className="mb-2 font-medium">{colunaTitulo?.celula(linha)}</div>
            <dl className="space-y-1">
              {demais.map((coluna) => (
                <div key={coluna.titulo} className="flex items-start justify-between gap-3 text-sm">
                  <dt className="shrink-0 text-muted-foreground">{coluna.titulo}</dt>
                  <dd className="min-w-0 text-right">{coluna.celula(linha)}</dd>
                </div>
              ))}
            </dl>
            {acoes && <div className="mt-3 flex flex-wrap gap-1 border-t pt-2">{acoes(linha)}</div>}
          </div>
        ))}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((coluna) => (
                <TableHead
                  key={coluna.titulo}
                  className={cn(coluna.alinhar === 'direita' && 'text-right', coluna.className)}
                >
                  {coluna.titulo}
                </TableHead>
              ))}
              {acoes && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={chave(linha)}>
                {colunas.map((coluna) => (
                  <TableCell
                    key={coluna.titulo}
                    className={cn(coluna.alinhar === 'direita' && 'text-right', coluna.className)}
                  >
                    {coluna.celula(linha)}
                  </TableCell>
                ))}
                {acoes && (
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">{acoes(linha)}</div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
