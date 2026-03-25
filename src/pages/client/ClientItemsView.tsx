import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Package } from 'lucide-react'
import { useState } from 'react'
import type { ItemStatus } from '@/integrations/supabase/types'

const statusLabels: Record<ItemStatus, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  in_review: { label: 'Em Revisão', variant: 'warning' },
  classified: { label: 'Classificado', variant: 'success' },
}

export default function ClientItemsView() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')

  const { data: items, isLoading } = useQuery({
    queryKey: ['client-items', user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('office_id').eq('id', user!.id).single() as any
      if (!(profile as any)?.office_id) return []
      const { data } = await supabase
        .from('items')
        .select('*, item_classifications(cclasstrib_code, cst_ibs_cbs, status, justification)')
        .eq('office_id', (profile as any).office_id)
        .order('created_at', { ascending: false }) as any
      return (data as any[]) || []
    },
    enabled: !!user,
  })

  const filtered = (items || []).filter(i =>
    i.description.toLowerCase().includes(search.toLowerCase()) ||
    (i.ncm_current || '').includes(search)
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meus Itens</h1>
        <p className="text-gray-500 text-sm mt-1">Produtos e serviços com status de classificação IBS/CBS</p>
      </div>

      <Input placeholder="Buscar por descrição ou NCM..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-14 animate-pulse bg-gray-100 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nenhum item encontrado.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Descrição</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">NCM</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">cClassTrib</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item: any) => {
                const classif = item.item_classifications?.[0]
                const { label, variant } = statusLabels[item.status as ItemStatus]
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-900 max-w-sm truncate">{item.description}</td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-600">{item.ncm_current || '—'}</td>
                    <td className="py-3 px-4">
                      {classif?.cclasstrib_code ? (
                        <Badge variant="default" className="font-mono text-xs">{classif.cclasstrib_code}</Badge>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={variant} className="text-xs">{label}</Badge>
                    </td>
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
