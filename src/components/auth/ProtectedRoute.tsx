import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireOfficeRole?: boolean
  requireCompanyRole?: boolean
}

export function ProtectedRoute({ children, requireOfficeRole, requireCompanyRole }: ProtectedRouteProps) {
  const { user, loading, isOfficeStaff, isCompanyUser } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (requireOfficeRole && !isOfficeStaff) return <Navigate to="/empresa/dashboard" replace />
  if (requireCompanyRole && !isCompanyUser) return <Navigate to="/admin/dashboard" replace />

  return <>{children}</>
}
