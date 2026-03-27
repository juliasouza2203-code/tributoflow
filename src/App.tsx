import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { ClientLayout } from '@/components/client/ClientLayout'

// Public pages
import Index from '@/pages/Index'
import Login from '@/pages/Login'
import RegisterOffice from '@/pages/RegisterOffice'

// Admin pages
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminClients from '@/pages/admin/AdminClients'
import AdminItems from '@/pages/admin/AdminItems'
import AdminNcmDiagnostics from '@/pages/admin/AdminNcmDiagnostics'
import AdminClassification from '@/pages/admin/AdminClassification'
import AdminPriceSimulation from '@/pages/admin/AdminPriceSimulation'
import AdminReports from '@/pages/admin/AdminReports'
import AdminUsers from '@/pages/admin/AdminUsers'
import AdminSettings from '@/pages/admin/AdminSettings'
import AdminNcmImport from '@/pages/admin/AdminNcmImport'

// Client pages
import ClientDashboard from '@/pages/client/ClientDashboard'
import ClientItemsView from '@/pages/client/ClientItemsView'
import ClientSimulations from '@/pages/client/ClientSimulations'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

function ClientPortalLayout() {
  return (
    <ClientLayout>
      <Outlet />
    </ClientLayout>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" richColors />
          <Routes>
            {/* Public */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro/escritorio" element={<RegisterOffice />} />

            {/* Admin — office staff */}
            <Route element={<ProtectedRoute requireOfficeRole><AdminLayout /></ProtectedRoute>}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/clientes" element={<AdminClients />} />
              <Route path="/admin/itens" element={<AdminItems />} />
              <Route path="/admin/ncm-diagnostico" element={<AdminNcmDiagnostics />} />
              <Route path="/admin/classificacao" element={<AdminClassification />} />
              <Route path="/admin/precos" element={<AdminPriceSimulation />} />
              <Route path="/admin/relatorios" element={<AdminReports />} />
              <Route path="/admin/usuarios" element={<AdminUsers />} />
              <Route path="/admin/configuracoes" element={<AdminSettings />} />
              <Route path="/admin/importar-ncm" element={<AdminNcmImport />} />
            </Route>

            {/* Client portal */}
            <Route element={<ProtectedRoute><ClientPortalLayout /></ProtectedRoute>}>
              <Route path="/empresa/dashboard" element={<ClientDashboard />} />
              <Route path="/empresa/itens" element={<ClientItemsView />} />
              <Route path="/empresa/simulacoes" element={<ClientSimulations />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
