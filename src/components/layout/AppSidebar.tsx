import { Factory } from 'lucide-react'
import { NavLink } from 'react-router-dom'
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
} from '@/components/ui/sidebar'
import { useAuth } from '@/lib/auth'
import { dashboardItem, navGroups } from './nav-config'

export function AppSidebar() {
  const { hasPermission } = useAuth()

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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<NavLink to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Factory className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">ThermoTech ERP</span>
                <span className="text-xs text-muted-foreground">erpblel</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<NavLink to={dashboardItem.url} end />}
                  tooltip={dashboardItem.title}
                >
                  <dashboardItem.icon />
                  <span>{dashboardItem.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {gruposVisiveis.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel className="flex items-center gap-2">
              <group.icon className="size-3.5" />
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton render={<NavLink to={item.url} />} tooltip={item.title}>
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

    </Sidebar>
  )
}
