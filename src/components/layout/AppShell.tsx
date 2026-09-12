import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { MenuUsuario } from '@/components/layout/MenuUsuario'
import { TemaToggle } from '@/components/layout/TemaToggle'
import { encontrarRota } from '@/components/layout/nav-config'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

export function AppShell() {
  const { pathname } = useLocation()
  const { grupo, item } = encontrarRota(pathname)

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* A barra era uma faixa vazia com o botão da sidebar e um separador
            solto — agora carrega contexto, tema e conta. */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />

          <Breadcrumb className="min-w-0">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Início</BreadcrumbLink>
              </BreadcrumbItem>
              {grupo && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="hidden sm:inline-flex">
                    <span className="text-muted-foreground">{grupo.title}</span>
                  </BreadcrumbItem>
                </>
              )}
              {item && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="truncate">{item.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>

          <div className="ml-auto flex items-center gap-1">
            <TemaToggle />
            <MenuUsuario />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
