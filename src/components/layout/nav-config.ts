import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ChartColumn,
  ClipboardList,
  ClipboardPen,
  Contact,
  FileClock,
  FileInput,
  Factory,
  FileStack,
  Gauge,
  Layers,
  LayoutDashboard,
  Package,
  ScanLine,
  Receipt,
  ReceiptText,
  ShoppingCart,
  Tags,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import type { Permissao } from '@/lib/permissoes'

export type NavItem = {
  title: string
  url: string
  /**
   * Obrigatório: com a barra recolhida (`collapsible="icon"`) o item é só o
   * ícone. Sem ele o menu virava uma coluna de letras cortadas ("P…", "C…").
   */
  icon: typeof LayoutDashboard
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
      { title: 'Produtos', url: '/estoque/produtos', icon: Package },
      { title: 'Categorias', url: '/estoque/categorias', icon: Tags },
      { title: 'Estoque mínimo', url: '/estoque/minimos', icon: Gauge },
      { title: 'Necessidade de materiais', url: '/estoque/necessidade', icon: Layers },
      { title: 'Movimentações', url: '/estoque/movimentacoes', icon: ArrowLeftRight },
      { title: 'Rastreio', url: '/estoque/rastreio', icon: ScanLine },
      {
        title: 'Entrada de NF-e',
        url: '/estoque/entradas',
        icon: FileInput,
        permissao: 'estoque.entradas.processar',
      },
    ],
  },
  {
    title: 'Produção',
    icon: Factory,
    items: [
      {
        title: 'Ordens de produção',
        url: '/producao/ordens',
        icon: Factory,
        permissao: 'producao.gerenciar',
      },
    ],
  },
  {
    title: 'Compras',
    icon: ShoppingCart,
    items: [
      {
        title: 'Solicitações',
        url: '/compras/solicitacoes',
        icon: ClipboardPen,
        permissao: 'compras.solicitar',
      },
    ],
  },
  {
    title: 'Ordens de Serviço',
    icon: Wrench,
    items: [
      { title: 'Ordens de serviço', url: '/os', icon: ClipboardList },
      { title: 'Serviços', url: '/os/servicos', icon: Wrench },
    ],
  },
  {
    title: 'Financeiro',
    icon: ReceiptText,
    items: [
      {
        title: 'Contas a receber',
        url: '/financeiro/contas-a-receber',
        icon: TrendingUp,
        permissao: 'financeiro.gerenciar',
      },
      {
        title: 'Contas a pagar',
        url: '/financeiro/contas-a-pagar',
        icon: TrendingDown,
        permissao: 'financeiro.gerenciar',
      },
      {
        title: 'Caixa',
        url: '/financeiro/caixa',
        icon: Wallet,
        permissao: 'financeiro.gerenciar',
      },
    ],
  },
  {
    title: 'Relatórios',
    icon: BarChart3,
    items: [
      { title: 'Gerenciais', url: '/relatorios', icon: ChartColumn, permissao: 'relatorios.ver' },
    ],
  },
  {
    title: 'Administrativo',
    icon: Users,
    items: [
      { title: 'Clientes', url: '/administrativo/clientes', icon: Contact },
      { title: 'Fornecedores', url: '/administrativo/fornecedores', icon: Truck },
      {
        title: 'Usuários',
        url: '/administrativo/usuarios',
        icon: UserCog,
        permissao: 'administrativo.usuarios.gerenciar',
      },
      {
        title: 'Auditoria',
        url: '/administrativo/auditoria',
        icon: FileClock,
        permissao: 'administrativo.usuarios.gerenciar',
      },
    ],
  },
  {
    title: 'Fiscal',
    icon: FileStack,
    items: [{ title: 'NFC-e', url: '/fiscal', icon: Receipt, permissao: 'fiscal.gerenciar' }],
  },
]

export const dashboardItem: NavItem = { title: 'Dashboard', url: '/', icon: LayoutDashboard }

/** Acha a que grupo/item do menu uma rota pertence — usado no breadcrumb. */
export function encontrarRota(pathname: string): { grupo?: NavGroup; item?: NavItem } {
  for (const grupo of navGroups) {
    for (const item of grupo.items) {
      if (pathname === item.url || pathname.startsWith(`${item.url}/`)) {
        return { grupo, item }
      }
    }
  }
  return {}
}
