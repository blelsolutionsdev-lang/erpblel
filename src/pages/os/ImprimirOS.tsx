import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOsAnexos } from '@/components/os/OsAnexos'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { prioridadeLabel, statusLabel } from '@/lib/os'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type OsCompleta = Tables<'ordens_servico'> & {
  cliente: Tables<'clientes'> | null
  tecnico: Tables<'profiles'> | null
  equipamento: Tables<'equipamentos'> | null
}

type Item = Tables<'ordens_servico_itens'>

/**
 * Via impressa da OS — é o documento que o cliente leva e que fecha o ciclo da
 * assinatura coletada na conclusão (antes a assinatura era guardada e nunca
 * aparecia em lugar nenhum).
 */
export function ImprimirOS() {
  const { id } = useParams<{ id: string }>()

  const { data: os, isLoading } = useQuery({
    queryKey: ['os_impressao', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*, cliente:clientes(*), tecnico:profiles(*), equipamento:equipamentos(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as OsCompleta
    },
  })

  const { data: itens } = useQuery({
    queryKey: ['os_itens', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_servico_itens')
        .select('*')
        .eq('os_id', id!)
        .order('created_at')
      if (error) throw error
      return data as Item[]
    },
  })

  const { data: empresa } = useQuery({
    queryKey: ['configuracoes_fiscais_publicas'],
    queryFn: async () => {
      const { data } = await supabase
        .from('configuracoes_fiscais')
        .select('razao_social, nome_fantasia, cnpj, telefone, municipio, uf')
        .eq('ativo', true)
        .maybeSingle()
      return data
    },
  })

  const { data: anexos } = useOsAnexos(id ?? null)
  const assinatura = anexos?.find((a) => a.tipo === 'assinatura_cliente')
  const fotos = anexos?.filter((a) => a.tipo === 'foto_conclusao') ?? []

  useEffect(() => {
    if (os) document.title = `OS ${os.numero} — ${os.cliente?.nome ?? ''}`
  }, [os])

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando...</div>
  if (!os) return <div className="p-8 text-sm text-destructive">Ordem de serviço não encontrada.</div>

  const pecas = itens?.filter((i) => i.tipo === 'peca') ?? []
  const servicos = itens?.filter((i) => i.tipo === 'servico') ?? []

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          .sem-impressao { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="sem-impressao mb-4 flex justify-end">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Imprimir
        </Button>
      </div>

      <header className="flex items-start justify-between border-b border-black/20 pb-3">
        <div>
          <h1 className="text-lg font-bold">
            {empresa?.nome_fantasia || empresa?.razao_social || 'ThermoTech ERP'}
          </h1>
          <p className="text-xs">
            {empresa?.razao_social}
            {empresa?.cnpj ? ` · CNPJ ${empresa.cnpj}` : ''}
          </p>
          <p className="text-xs">
            {[empresa?.municipio, empresa?.uf].filter(Boolean).join('/')}
            {empresa?.telefone ? ` · ${empresa.telefone}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">OS #{os.numero}</p>
          <p className="text-xs">{statusLabel[os.status]}</p>
          <p className="text-xs">Abertura: {formatDate(os.data_abertura)}</p>
          {os.data_conclusao && <p className="text-xs">Conclusão: {formatDate(os.data_conclusao)}</p>}
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-black/60">Cliente</p>
          <p className="font-medium">{os.cliente?.nome ?? '—'}</p>
          <p className="text-xs">{os.cliente?.cpf_cnpj ?? ''}</p>
          <p className="text-xs">
            {[os.cliente?.telefone, os.cliente?.email].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-black/60">Equipamento</p>
          <p className="font-medium">
            {os.equipamento
              ? [os.equipamento.tipo, os.equipamento.marca, os.equipamento.modelo]
                  .filter(Boolean)
                  .join(' · ') || 'Equipamento'
              : 'Não informado'}
          </p>
          {os.equipamento?.numero_serie && (
            <p className="text-xs">Nº de série: {os.equipamento.numero_serie}</p>
          )}
          <p className="text-xs">
            Técnico: {os.tecnico?.nome ?? '—'} · Prioridade: {prioridadeLabel[os.prioridade]}
          </p>
          {os.data_prevista && <p className="text-xs">Previsão: {formatDate(os.data_prevista)}</p>}
        </div>
      </section>

      <section className="mt-4 text-sm">
        <p className="text-xs font-semibold uppercase text-black/60">Problema relatado</p>
        <p className="whitespace-pre-wrap">{os.problema_relatado || '—'}</p>
      </section>

      {os.laudo_tecnico && (
        <section className="mt-4 text-sm">
          <p className="text-xs font-semibold uppercase text-black/60">Laudo técnico</p>
          <p className="whitespace-pre-wrap">{os.laudo_tecnico}</p>
        </section>
      )}

      {pecas.length > 0 && (
        <section className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase text-black/60">Peças e produtos</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/20 text-left text-xs">
                <th className="py-1">Descrição</th>
                <th className="py-1 text-right">Qtd</th>
                <th className="py-1 text-right">Unitário</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {pecas.map((i) => (
                <tr key={i.id} className="border-b border-black/10">
                  <td className="py-1">{i.descricao}</td>
                  <td className="py-1 text-right">{i.quantidade}</td>
                  <td className="py-1 text-right">{formatCurrency(i.valor_unitario)}</td>
                  <td className="py-1 text-right">{formatCurrency(i.valor_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {servicos.length > 0 && (
        <section className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase text-black/60">Serviços</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/20 text-left text-xs">
                <th className="py-1">Descrição</th>
                <th className="py-1 text-right">Qtd</th>
                <th className="py-1 text-right">Unitário</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {servicos.map((i) => (
                <tr key={i.id} className="border-b border-black/10">
                  <td className="py-1">{i.descricao}</td>
                  <td className="py-1 text-right">{i.quantidade}</td>
                  <td className="py-1 text-right">{formatCurrency(i.valor_unitario)}</td>
                  <td className="py-1 text-right">{formatCurrency(i.valor_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-4 flex justify-end">
        <table className="text-sm">
          <tbody>
            <tr>
              <td className="pr-6 text-right text-black/60">Peças</td>
              <td className="text-right">{formatCurrency(os.valor_pecas)}</td>
            </tr>
            <tr>
              <td className="pr-6 text-right text-black/60">Serviços</td>
              <td className="text-right">{formatCurrency(os.valor_servicos)}</td>
            </tr>
            <tr>
              <td className="pr-6 text-right text-black/60">Acréscimo</td>
              <td className="text-right">+ {formatCurrency(os.valor_acrescimo)}</td>
            </tr>
            <tr>
              <td className="pr-6 text-right text-black/60">Desconto</td>
              <td className="text-right">- {formatCurrency(os.valor_desconto)}</td>
            </tr>
            <tr className="border-t border-black/30">
              <td className="pr-6 pt-1 text-right font-semibold">Total</td>
              <td className="pt-1 text-right font-semibold">{formatCurrency(os.valor_total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {os.status === 'concluida' && (
        <p className="mt-3 text-xs">
          Garantia do serviço: {os.garantia_dias} dias
          {os.garantia_ate ? ` — até ${formatDate(os.garantia_ate)}` : ''}.
        </p>
      )}

      {fotos.length > 0 && (
        <section className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase text-black/60">
            Registro fotográfico da conclusão
          </p>
          <div className="grid grid-cols-4 gap-2">
            {fotos.slice(0, 8).map(
              (f) =>
                f.url && (
                  <img
                    key={f.id}
                    src={f.url}
                    alt="Foto da conclusão"
                    className="aspect-square w-full rounded border border-black/10 object-cover"
                  />
                ),
            )}
          </div>
        </section>
      )}

      <section className="mt-8 grid grid-cols-2 gap-8 text-sm">
        <div>
          <div className="h-16">
            {assinatura?.url && (
              <img src={assinatura.url} alt="Assinatura do cliente" className="h-16 object-contain" />
            )}
          </div>
          <div className="border-t border-black/40 pt-1 text-center text-xs">
            {os.assinatura_cliente_nome || 'Cliente'}
            {os.assinatura_em && (
              <div className="text-[10px] text-black/60">{formatDateTime(os.assinatura_em)}</div>
            )}
          </div>
        </div>
        <div>
          <div className="h-16" />
          <div className="border-t border-black/40 pt-1 text-center text-xs">
            {os.tecnico?.nome || 'Técnico responsável'}
          </div>
        </div>
      </section>
    </div>
  )
}
