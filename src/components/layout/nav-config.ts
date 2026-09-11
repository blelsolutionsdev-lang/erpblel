import {
  Boxes,
  FileStack,
  LayoutDashboard,
  ReceiptText,
  Users,
  Wrench,
} from 'lucide-react'

export type NavItem = {
  title: string
  url: string
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
      { title: 'Movimentações', url: '/estoque/movimentacoes' },
      { title: 'Entrada de NF-e', url: '/estoque/entradas' },
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
      { title: 'Contas a receber', url: '/financeiro/contas-a-receber' },
      { title: 'Contas a pagar', url: '/financeiro/contas-a-pagar' },
    ],
  },
  {
    title: 'Administrativo',
    icon: Users,
    items: [
      { title: 'Clientes', url: '/administrativo/clientes' },
      { title: 'Fornecedores', url: '/administrativo/fornecedores' },
      { title: 'Usuários', url: '/administrativo/usuarios' },
    ],
  },
  {
    title: 'Fiscal',
    icon: FileStack,
    items: [{ title: 'NFC-e', url: '/fiscal' }],
  },
]

export const dashboardItem = { title: 'Dashboard', url: '/', icon: LayoutDashboard }
