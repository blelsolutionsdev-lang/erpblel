import type { Enums } from '@/types/database'

export type OsStatus = Enums<'os_status'>
export type OsPrioridade = Enums<'os_prioridade'>

export const statusLabel: Record<OsStatus, string> = {
  aberta: 'Aberta',
  orcamento: 'Orçamento enviado',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  reprovada: 'Orçamento reprovado',
}

export const statusVariant: Record<OsStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  aberta: 'secondary',
  orcamento: 'outline',
  em_andamento: 'default',
  aguardando_peca: 'outline',
  concluida: 'default',
  cancelada: 'destructive',
  reprovada: 'destructive',
}

/** Status que o usuário pode escolher direto no seletor da listagem. */
export const statusManuais: OsStatus[] = [
  'aberta',
  'em_andamento',
  'aguardando_peca',
  'concluida',
  'cancelada',
]

export const prioridadeLabel: Record<OsPrioridade, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const prioridadeVariant: Record<OsPrioridade, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  baixa: 'outline',
  normal: 'secondary',
  alta: 'default',
  urgente: 'destructive',
}

export function osEmAberto(status: OsStatus) {
  return status !== 'concluida' && status !== 'cancelada' && status !== 'reprovada'
}

/** Dias de atraso em relação à data prevista (0 se no prazo ou sem previsão). */
export function diasAtraso(dataPrevista: string | null, status: OsStatus) {
  if (!dataPrevista || !osEmAberto(status)) return 0
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const prevista = new Date(`${dataPrevista}T00:00:00`)
  const diff = Math.floor((hoje.getTime() - prevista.getTime()) / 86_400_000)
  return diff > 0 ? diff : 0
}

export function garantiaVigente(garantiaAte: string | null) {
  if (!garantiaAte) return false
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return new Date(`${garantiaAte}T00:00:00`).getTime() >= hoje.getTime()
}
