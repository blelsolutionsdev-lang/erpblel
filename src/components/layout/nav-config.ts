import {
  BarChart3,
  Boxes,
  FileStack,
  LayoutDashboard,
  ReceiptText,
  Users,
  Wrench,
} from 'lucide-react'
import type { Permissao } from '@/lib/permissoes'

export type NavItem = {
  title: string
  url: string
  /** Sem a permissão, o item some do menu e a rota é bloqueada. */
  permissao?: Permissao
}

export type NavGroup = {
  title: string
  icon: typeof LayoutDashboard
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    title: 'Estoque',
    icon: Boxes,
    items: [
      { title: 'Produtos', url: '/estoque/produtos' },
      { title: 'Categorias', url: '/estoque/categorias' },
      { title: 'Movimentações', url: '/estoque/movimentacoes' },
      {
        title: 'Entrada de NF-e',
        url: '/estoque/entradas',
        permissao: 'estoque.entradas.processar',
      },
    ],
  },
  {
    title: 'Ordens de Serviço',
    icon: Wrench,
    items: [
      { title: 'Ordens de serviço', url: '/os' },
      { title: 'Serviços', url: '/os/servicos' },
    ],
  },
  {
    title: 'Financeiro',
    icon: ReceiptText,
    items: [
      {
        title: 'Contas a receber',
        url: '/financeiro/contas-a-receber',
        permissao: 'financeiro.gerenciar',
      },
      {
        title: 'Contas a pagar',
        url: '/financeiro/contas-a-pagar',
        permissao: 'financeiro.gerenciar',
      },
      { title: 'Caixa', url: '/financeiro/caixa', permissao: 'financeiro.gerenciar' },
    ],
  },
  {
    title: 'Relatórios',
    icon: BarChart3,
    items: [{ title: 'Gerenciais', url: '/relatorios', permissao: 'relatorios.ver' }],
  },
  {
    title: 'Administrativo',
    icon: Users,
    items: [
      { title: 'Clientes', url: '/administrativo/clientes' },
      { title: 'Fornecedores', url: '/administrativo/fornecedores' },
      {
        title: 'Usuários',
        url: '/administrativo/usuarios',
        permissao: 'administrativo.usuarios.gerenciar',
      },
      {
        title: 'Auditoria',
        url: '/administrativo/auditoria',
        permissao: 'administrativo.usuarios.gerenciar',
      },
    ],
  },
  {
    title: 'Fiscal',
    icon: FileStack,
    items: [{ title: 'NFC-e', url: '/fiscal', permissao: 'fiscal.gerenciar' }],
  },
]

export const dashboardItem = { title: 'Dashboard', url: '/', icon: LayoutDashboard }
