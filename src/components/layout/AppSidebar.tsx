import { Factory } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { useAuth } from '@/lib/auth'
import { dashboardItem, navGroups, type NavItem } from './nav-config'

/** Mesma regra do breadcrumb: a raiz só casa exata, o resto casa com subrotas. */
function rotaAtiva(pathname: string, url: string) {
  if (url === '/') return pathname === '/'
  return pathname === url || pathname.startsWith(`${url}/`)
}

function ItemMenu({ item, pathname }: { item: NavItem; pathname: string }) {
  return (
    <SidebarMenuItem>
      {/* O tema é monocromático: o `bg-sidebar-accent` padrão do item ativo
          (0.97) some contra o fundo da barra (0.985) e fica idêntico ao hover.
          Pílula escura para enxergar onde a pessoa está, inclusive recolhido. */}
      <SidebarMenuButton
        render={<NavLink to={item.url} />}
        tooltip={item.title}
        isActive={rotaAtiva(pathname, item.url)}
        className="data-active:bg-primary data-active:text-primary-foreground data-active:hover:bg-primary data-active:hover:text-primary-foreground"
      >
        <item.icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { hasPermission } = useAuth()
  const { pathname } = useLocation()

  // Grupo sem nenhum item permitido não aparece — antes o menu mostrava todos
  // os módulos para todo mundo, inclusive Usuários e Fiscal.
  const gruposVisiveis = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permissao || hasPermission(item.permissao)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<NavLink to="/" />}>
              <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Factory className="size-4" />
              </div>
              {/* Recolhido sobra só o quadrado do logo — sem isto o texto vazava. */}
              <div className="flex min-w-0 flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">ThermoTech ERP</span>
                <span className="truncate text-xs text-muted-foreground">erpblel</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 pb-2">
        <SidebarGroup className="pb-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <ItemMenu item={dashboardItem} pathname={pathname} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {gruposVisiveis.map((group) => (
          <SidebarGroup key={group.title} className="pb-0">
            {/* Recolhido o rótulo some (CSS do componente): o traço acima passa
                a ser a única separação entre os grupos de ícones. */}
            <SidebarSeparator className="mx-0 mb-2 hidden group-data-[collapsible=icon]:block" />
            <SidebarGroupLabel
              className="flex h-6 items-center gap-2 text-[11px] font-semibold tracking-wider uppercase group-data-[collapsible=icon]:-mt-6"
            >
              <group.icon className="size-3.5 shrink-0" />
              <span className="truncate">{group.title}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <ItemMenu key={item.url} item={item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
