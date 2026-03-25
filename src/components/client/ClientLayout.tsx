import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { LayoutDashboard, Package, Calculator, LogOut } from 'lucide-react'

const navItems = [
  { href: '/empresa/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/empresa/itens', label: 'Meus Itens', icon: Package },
  { href: '/empresa/simulacoes', label: 'Simulações', icon: Calculator },
]

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col sticky top-0 h-screen">
        <div className="px-4 py-5 border-b border-gray-200">
          <span className="text-lg font-bold text-blue-600">TributoFlow</span>
          <p className="text-xs text-gray-400 mt-0.5">Portal do Cliente</p>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location.pathname === href
            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5',
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-gray-200 p-3">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-gray-900 truncate">{profile?.full_name}</p>
            <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
