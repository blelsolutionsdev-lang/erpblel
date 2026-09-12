import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/lib/auth'
import { TemaProvider } from '@/lib/tema'
import { Login } from '@/pages/auth/Login'
import { RedefinirSenha } from '@/pages/auth/RedefinirSenha'
import { Dashboard } from '@/pages/Dashboard'

// As telas internas entram por code-splitting: quem só abre o dashboard não
// baixa o parser de NF-e, a tela de usuários nem o catálogo inteiro junto.
const Clientes = lazy(() => import('@/pages/administrativo/Clientes').then((m) => ({ default: m.Clientes })))
const Fornecedores = lazy(() =>
  import('@/pages/administrativo/Fornecedores').then((m) => ({ default: m.Fornecedores })),
)
const Usuarios = lazy(() => import('@/pages/administrativo/Usuarios').then((m) => ({ default: m.Usuarios })))
const Produtos = lazy(() => import('@/pages/estoque/Produtos').then((m) => ({ default: m.Produtos })))
const Movimentacoes = lazy(() =>
  import('@/pages/estoque/Movimentacoes').then((m) => ({ default: m.Movimentacoes })),
)
const Entradas = lazy(() => import('@/pages/estoque/Entradas').then((m) => ({ default: m.Entradas })))
const OrdensServico = lazy(() => import('@/pages/os/OrdensServico').then((m) => ({ default: m.OrdensServico })))
const Servicos = lazy(() => import('@/pages/os/Servicos').then((m) => ({ default: m.Servicos })))
const ContasReceber = lazy(() =>
  import('@/pages/financeiro/ContasReceber').then((m) => ({ default: m.ContasReceber })),
)
const ContasPagar = lazy(() => import('@/pages/financeiro/ContasPagar').then((m) => ({ default: m.ContasPagar })))
const Fiscal = lazy(() => import('@/pages/fiscal/Fiscal').then((m) => ({ default: m.Fiscal })))
const Categorias = lazy(() => import('@/pages/estoque/Categorias').then((m) => ({ default: m.Categorias })))
const NecessidadeMateriais = lazy(() =>
  import('@/pages/estoque/NecessidadeMateriais').then((m) => ({ default: m.NecessidadeMateriais })),
)
const SolicitacoesCompra = lazy(() =>
  import('@/pages/compras/SolicitacoesCompra').then((m) => ({ default: m.SolicitacoesCompra })),
)
const EstoqueMinimo = lazy(() =>
  import('@/pages/estoque/EstoqueMinimo').then((m) => ({ default: m.EstoqueMinimo })),
)
const Caixa = lazy(() => import('@/pages/financeiro/Caixa').then((m) => ({ default: m.Caixa })))
const Relatorios = lazy(() => import('@/pages/relatorios/Relatorios').then((m) => ({ default: m.Relatorios })))
const Auditoria = lazy(() => import('@/pages/administrativo/Auditoria').then((m) => ({ default: m.Auditoria })))
const ImprimirOS = lazy(() => import('@/pages/os/ImprimirOS').then((m) => ({ default: m.ImprimirOS })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function CarregandoTela() {
  return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
}

export default function App() {
  return (
    <ErrorBoundary>
      {/* O CSS já trazia os tokens `.dark` e o next-themes já era dependência,
          mas faltava o provider: o modo escuro nunca chegava a ser aplicado. */}
      <TemaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <Suspense fallback={<CarregandoTela />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/redefinir-senha" element={<RedefinirSenha />} />

                  {/* Via impressa da OS: fora do AppShell para sair limpa no papel. */}
                  <Route
                    path="/os/:id/imprimir"
                    element={
                      <ProtectedRoute>
                        <ImprimirOS />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    element={
                      <ProtectedRoute>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/" element={<Dashboard />} />

                    <Route path="/estoque/produtos" element={<Produtos />} />
                    <Route path="/estoque/categorias" element={<Categorias />} />
                    <Route path="/estoque/minimos" element={<EstoqueMinimo />} />
                    <Route path="/estoque/necessidade" element={<NecessidadeMateriais />} />
                    <Route path="/estoque/movimentacoes" element={<Movimentacoes />} />
                    <Route
                      path="/estoque/entradas"
                      element={
                        <ProtectedRoute permissao="estoque.entradas.processar">
                          <Entradas />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/compras/solicitacoes"
                      element={
                        <ProtectedRoute permissao="compras.solicitar">
                          <SolicitacoesCompra />
                        </ProtectedRoute>
                      }
                    />

                    <Route path="/os" element={<OrdensServico />} />
                    <Route path="/os/servicos" element={<Servicos />} />

                    <Route
                      path="/financeiro/contas-a-receber"
                      element={
                        <ProtectedRoute permissao="financeiro.gerenciar">
                          <ContasReceber />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/financeiro/contas-a-pagar"
                      element={
                        <ProtectedRoute permissao="financeiro.gerenciar">
                          <ContasPagar />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/financeiro/caixa"
                      element={
                        <ProtectedRoute permissao="financeiro.gerenciar">
                          <Caixa />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/relatorios"
                      element={
                        <ProtectedRoute permissao="relatorios.ver">
                          <Relatorios />
                        </ProtectedRoute>
                      }
                    />

                    <Route path="/administrativo/clientes" element={<Clientes />} />
                    <Route path="/administrativo/fornecedores" element={<Fornecedores />} />
                    <Route
                      path="/administrativo/usuarios"
                      element={
                        <ProtectedRoute permissao="administrativo.usuarios.gerenciar">
                          <Usuarios />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/administrativo/auditoria"
                      element={
                        <ProtectedRoute permissao="administrativo.usuarios.gerenciar">
                          <Auditoria />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/fiscal"
                      element={
                        <ProtectedRoute permissao="fiscal.gerenciar">
                          <Fiscal />
                        </ProtectedRoute>
                      }
                    />

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster />
          </AuthProvider>
        </QueryClientProvider>
      </TemaProvider>
    </ErrorBoundary>
  )
}
