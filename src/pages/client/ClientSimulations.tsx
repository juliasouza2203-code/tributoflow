import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils'
import { Calculator, TrendingUp, TrendingDown, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

export default function ClientSimulations() {
  const { user } = useAuth()

  const { data: scenarios, isLoading } = useQuery({
    queryKey: ['client-scenarios', user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('office_id').eq('id', user!.id).single() as any
      if (!(profile as any)?.office_id) return []
      const { data } = await supabase
        .from('price_scenarios')
        .select('*, items(description, ncm_current)')
        .eq('office_id', (profile as any).office_id)
        .order('created_at', { ascending: false }) as any
      return (data as any[]) || []
    },
    enabled: !!user,
  })

  function exportXLSX() {
    if (!scenarios?.length) return toast.info('Sem simulações para exportar')
    const rows = scenarios.map((s: any) => ({
      'Item': s.items?.description || '',
      'NCM': s.items?.ncm_current || '',
      'Cenário': s.scenario_name,
      'Custo': s.cost,
      'Preço Atual': s.price_before.toFixed(2),
      'Preço IBS/CBS': s.price_after.toFixed(2),
      'Carga Atual (R$)': s.tax_load_before.toFixed(2),
      'Carga IBS/CBS (R$)': s.tax_load_after.toFixed(2),
      'Data': formatDate(s.created_at),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Simulações')
    XLSX.writeFile(wb, 'simulacoes-ibscbs.xlsx')
    toast.success('Planilha exportada!')
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Simulações de Preços</h1>
          <p className="text-gray-500 text-sm mt-1">Impacto da reforma tributária nos seus preços de venda</p>
        </div>
        <Button variant="outline" onClick={exportXLSX} className="gap-2">
          <Download className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 animate-pulse bg-gray-100 rounded-lg" />)}
          </div>
        ) : !scenarios?.length ? (
          <div className="py-16 text-center">
            <Calculator className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Seu escritório ainda não gerou simulações de preços.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Preço Atual</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Preço IBS/CBS</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Variação</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Carga Nova</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Cenário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scenarios.map((s: any) => {
                  const variation = s.price_before > 0 ? (s.price_after / s.price_before - 1) * 100 : 0
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-900 max-w-xs truncate">{s.items?.description || '—'}</p>
                        <p className="text-xs font-mono text-gray-400">{s.items?.ncm_current || ''}</p>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">{formatCurrency(s.price_before)}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">{formatCurrency(s.price_after)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`flex items-center justify-end gap-1 text-xs font-medium ${variation >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {variation >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {formatPercent(Math.abs(variation))}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600 text-xs">
                        {formatPercent(s.tax_load_after > 0 && s.price_after > 0 ? (s.tax_load_after / s.price_after) * 100 : 0)}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{s.scenario_name}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
