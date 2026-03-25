import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, UserPlus } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { AppRole } from '@/integrations/supabase/types'
import { toast } from 'sonner'

const roleLabels: Record<AppRole, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  office_owner: { label: 'Sócio/Diretor', variant: 'default' },
  office_staff: { label: 'Analista Fiscal', variant: 'secondary' },
  company_user: { label: 'Portal Cliente', variant: 'outline' },
}

export default function AdminUsers() {
  const { officeId } = useAuth()

  const { data: users, isLoading } = useQuery({
    queryKey: ['office-users', officeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('*, profiles(id, full_name, email, avatar_url, created_at)')
        .eq('office_id', officeId!)
      return data || []
    },
    enabled: !!officeId,
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários e Permissões</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie acessos do escritório e do portal do cliente</p>
        </div>
        <Button className="gap-2" onClick={() => toast.info('Convite por email em breve')}>
          <UserPlus className="h-4 w-4" /> Convidar Usuário
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-gray-100 rounded-lg" />)}
          </div>
        ) : users?.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nenhum usuário encontrado.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Usuário</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Perfil</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Desde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users?.map((u: any) => {
                const { label, variant } = roleLabels[u.role as AppRole] || roleLabels.office_staff
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-600">
                          {(u.profiles?.full_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{u.profiles?.full_name || 'Usuário'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{u.profiles?.email || '—'}</td>
                    <td className="py-3 px-4"><Badge variant={variant}>{label}</Badge></td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{u.profiles?.created_at ? formatDate(u.profiles.created_at) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
