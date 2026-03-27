import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard, Building2, Package, Search, Tags,
  Calculator, FileText, Users, Settings, LogOut, ChevronLeft, FileUp,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/clientes', label: 'Empresas Clientes', icon: Building2 },
  { href: '/admin/itens', label: 'Itens / Produtos', icon: Package },
  { href: '/admin/importar-ncm', label: 'Importar Produtos', icon: FileUp },
  { href: '/admin/ncm-diagnostico', label: 'Diagnóstico NCM', icon: Search },
  { href: '/admin/classificacao', label: 'Classificação Fiscal', icon: Tags },
  { href: '/admin/precos', label: 'Simulador de Preços', icon: Calculator },
  { href: '/admin/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/admin/usuarios', label: 'Usuários', icon: Users },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
]

export function AdminSidebar() {
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={cn(
      'flex flex-col h-screen bg-gray-900 text-white transition-all duration-300 sticky top-0',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-800">
        {!collapsed && (
          <div>
            <span className="text-lg font-bold text-blue-400">TributoFlow</span>
            <p className="text-xs text-gray-400 mt-0.5">IBS/CBS</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors ml-auto"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location.pathname === href
          return (
            <Link
              key={href}
              to={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-gray-800 p-3">
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-white truncate">{profile?.full_name || 'Usuário'}</p>
            <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
          </div>
        )}
        <button
          onClick={signOut}
          title={collapsed ? 'Sair' : undefined}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  )
}
