import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/lib/auth'
import { Login } from '@/pages/auth/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Clientes } from '@/pages/administrativo/Clientes'
import { Fornecedores } from '@/pages/administrativo/Fornecedores'
import { Usuarios } from '@/pages/administrativo/Usuarios'
import { Produtos } from '@/pages/estoque/Produtos'
import { Movimentacoes } from '@/pages/estoque/Movimentacoes'
import { Entradas } from '@/pages/estoque/Entradas'
import { OrdensServico } from '@/pages/os/OrdensServico'
import { Servicos } from '@/pages/os/Servicos'
import { ContasReceber } from '@/pages/financeiro/ContasReceber'
import { ContasPagar } from '@/pages/financeiro/ContasPagar'
import { Fiscal } from '@/pages/fiscal/Fiscal'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />

              <Route path="/estoque/produtos" element={<Produtos />} />
              <Route path="/estoque/movimentacoes" element={<Movimentacoes />} />
              <Route path="/estoque/entradas" element={<Entradas />} />

              <Route path="/os" element={<OrdensServico />} />
              <Route path="/os/servicos" element={<Servicos />} />

              <Route path="/financeiro/contas-a-receber" element={<ContasReceber />} />
              <Route path="/financeiro/contas-a-pagar" element={<ContasPagar />} />

              <Route path="/administrativo/clientes" element={<Clientes />} />
              <Route path="/administrativo/fornecedores" element={<Fornecedores />} />
              <Route path="/administrativo/usuarios" element={<Usuarios />} />

              <Route path="/fiscal" element={<Fiscal />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  )
}
