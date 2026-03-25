import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { KpiCardFiscal } from '@/components/admin/KpiCardFiscal'
import { Badge } from '@/components/ui/badge'
import { Package, CheckCircle, Clock, Calculator } from 'lucide-react'

export default function ClientDashboard() {
  const { user } = useAuth()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['client-stats', user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('office_id').eq('id', user!.id).single() as any
      if (!profile) return null

      const { data: items } = await supabase
        .from('items')
        .select('id, status')
        .eq('office_id', (profile as any).office_id) as any

      const all: any[] = items || []
      return {
        total: all.length,
        classified: all.filter((i: any) => i.status === 'classified').length,
        pending: all.filter((i: any) => i.status === 'pending').length,
        inReview: all.filter((i: any) => i.status === 'in_review').length,
      }
    },
    enabled: !!user,
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Painel da Empresa</h1>
          <p className="text-gray-500 text-sm mt-1">Acompanhe o status da sua classificação IBS/CBS</p>
        </div>
        <Badge variant="secondary" className="text-blue-700 bg-blue-100">LC 214/2025</Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCardFiscal title="Total de Itens" value={isLoading ? '—' : stats?.total || 0} icon={Package} loading={isLoading} />
        <KpiCardFiscal title="Classificados" value={isLoading ? '—' : stats?.classified || 0} icon={CheckCircle} variant="success" loading={isLoading} />
        <KpiCardFiscal title="Em Revisão" value={isLoading ? '—' : stats?.inReview || 0} icon={Clock} variant="warning" loading={isLoading} />
        <KpiCardFiscal
          title="Progresso"
          value={isLoading ? '—' : stats?.total ? `${Math.round((stats.classified / stats.total) * 100)}%` : '0%'}
          subtitle="Itens classificados"
          icon={Calculator}
          variant={stats?.pending === 0 ? 'success' : 'default'}
          loading={isLoading}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Sobre a Reforma Tributária</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <p>A <strong>Lei Complementar 214/2025</strong> institui o <strong>IBS</strong> (Imposto sobre Bens e Serviços) e a <strong>CBS</strong> (Contribuição sobre Bens e Serviços) como parte da reforma tributária aprovada pela EC 132/2023.</p>
          <p>Seu escritório contábil está trabalhando na classificação dos seus produtos e serviços com os novos códigos (CST + cClassTrib) para garantir conformidade e calcular o impacto nos seus preços de venda.</p>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-blue-800 font-medium">Fique atento!</p>
            <p className="text-blue-700 mt-1">Após a classificação, você poderá visualizar as simulações de preços com e sem a reforma, permitindo planejar reajustes com antecedência.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
