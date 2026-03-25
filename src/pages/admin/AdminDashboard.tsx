import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { KpiCardFiscal } from '@/components/admin/KpiCardFiscal'
import { TaxImpactChart } from '@/components/admin/TaxImpactChart'
import { NcmIssueTable } from '@/components/admin/NcmIssueTable'
import { Badge } from '@/components/ui/badge'
import {
  Building2, Package, AlertTriangle, CheckCircle,
  Clock, TrendingDown
} from 'lucide-react'

export default function AdminDashboard() {
  const { officeId } = useAuth()

  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_companies')
        .select('id, legal_name, trade_name')
        .eq('office_id', officeId!)
      return data || []
    },
    enabled: !!officeId,
  })

  const { data: itemStats, isLoading: statsLoading } = useQuery({
    queryKey: ['item-stats', officeId],
    queryFn: async () => {
      const { data: items } = await supabase
        .from('items')
        .select('id, status, ncm_current, ncm_validated')
        .eq('office_id', officeId!)
      const all = items || []
      const total = all.length
      const withoutNcm = all.filter(i => !i.ncm_current).length
      const classified = all.filter(i => i.status === 'classified').length
      const pending = all.filter(i => i.status === 'pending').length
      return { total, withoutNcm, classified, pending }
    },
    enabled: !!officeId,
  })

  const { data: recentIssues } = useQuery({
    queryKey: ['recent-issues', officeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('items')
        .select('id, description, ncm_current, status, client_companies(legal_name)')
        .eq('office_id', officeId!)
        .is('ncm_current', null)
        .limit(5)
      return (data || []).map((i: any) => ({
        item_id: i.id,
        description: i.description,
        ncm_current: i.ncm_current,
        issue_type: 'missing_ncm' as const,
        company_name: i.client_companies?.legal_name || '—',
      }))
    },
    enabled: !!officeId,
  })

  const chartData = [
    { name: 'Tributação Normal', antes: 27.65, depois: 28.8 },
    { name: 'Redução 60%', antes: 27.65, depois: 11.52 },
    { name: 'Redução 100%', antes: 0, depois: 0 },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Fiscal</h1>
          <p className="text-gray-500 text-sm mt-1">Visão geral do seu escritório — IBS/CBS</p>
        </div>
        <Badge variant="secondary" className="text-blue-700 bg-blue-100 border-blue-200">
          LC 214/2025
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCardFiscal
          title="Empresas Clientes"
          value={companiesLoading ? '—' : companies?.length || 0}
          subtitle="Total gerenciadas"
          icon={Building2}
          variant="default"
        />
        <KpiCardFiscal
          title="Total de Itens"
          value={statsLoading ? '—' : itemStats?.total || 0}
          subtitle="Mercadorias e serviços"
          icon={Package}
          variant="default"
        />
        <KpiCardFiscal
          title="Itens sem NCM"
          value={statsLoading ? '—' : itemStats?.withoutNcm || 0}
          subtitle="Requerem diagnóstico"
          icon={AlertTriangle}
          variant={itemStats?.withoutNcm ? 'warning' : 'success'}
        />
        <KpiCardFiscal
          title="Itens Classificados"
          value={statsLoading ? '—' : `${itemStats?.classified || 0}/${itemStats?.total || 0}`}
          subtitle="Com cClassTrib definido"
          icon={CheckCircle}
          variant="success"
        />
      </div>

      {/* Progress Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Status de Classificação</h3>
          <div className="space-y-3">
            {[
              { label: 'Classificados', value: itemStats?.classified || 0, color: 'bg-green-500', icon: CheckCircle },
              { label: 'Em revisão', value: (itemStats?.total || 0) - (itemStats?.classified || 0) - (itemStats?.pending || 0), color: 'bg-yellow-400', icon: Clock },
              { label: 'Pendentes', value: itemStats?.pending || 0, color: 'bg-gray-300', icon: TrendingDown },
            ].map(({ label, value, color }) => {
              const pct = itemStats?.total ? Math.round((value / itemStats.total) * 100) : 0
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{label}</span>
                    <span>{value} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Empresas Recentes</h3>
          {companiesLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-8 animate-pulse bg-gray-100 rounded" />)}
            </div>
          ) : companies?.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma empresa cadastrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {companies?.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center gap-3 py-1">
                  <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center">
                    <Building2 className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <span className="text-sm text-gray-700">{c.trade_name || c.legal_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart + Issues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaxImpactChart
          data={chartData}
          title="Comparativo de Carga Tributária — Cenários IBS/CBS"
        />

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Itens com Pendência NCM</h3>
          <NcmIssueTable issues={recentIssues || []} />
        </div>
      </div>
    </div>
  )
}
