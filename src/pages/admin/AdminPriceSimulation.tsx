import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaxImpactChart } from '@/components/admin/TaxImpactChart'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { simulatePrice, DEFAULT_RATES } from '@/lib/tax-engine/ibs_cbs_calculator'
import { toast } from 'sonner'
import { Calculator, Download, TrendingUp, TrendingDown } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function AdminPriceSimulation() {
  const { officeId, user } = useAuth()
  const qc = useQueryClient()
  const [filterCompany, setFilterCompany] = useState('all')
  const [legacyRate, setLegacyRate] = useState(27.65)
  const [targetMargin, setTargetMargin] = useState(30)

  const { data: companies } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('client_companies').select('id, legal_name, trade_name').eq('office_id', officeId!)
      return data || []
    },
    enabled: !!officeId,
  })

  const { data: classifiedItems, isLoading } = useQuery({
    queryKey: ['classified-items', officeId, filterCompany],
    queryFn: async () => {
      let q = supabase
        .from('items')
        .select('*, item_classifications(cclasstrib_code, cst_ibs_cbs), client_companies(legal_name, trade_name)')
        .eq('office_id', officeId!)
        .eq('status', 'classified')
        .not('base_cost', 'is', null)
      if (filterCompany !== 'all') q = q.eq('company_id', filterCompany)
      const { data } = await q
      return data || []
    },
    enabled: !!officeId,
  })

  // cClassTrib reduction mapping (demo data)
  const REDUCTIONS: Record<string, { ibs: number; cbs: number }> = {
    '01': { ibs: 0, cbs: 0 },
    '02': { ibs: 0.6, cbs: 0.6 },
    '03': { ibs: 1, cbs: 1 },
    '04': { ibs: 0.3, cbs: 0.3 },
    '05': { ibs: 0.4, cbs: 0.4 },
    '06': { ibs: 1, cbs: 1 },
    '07': { ibs: 0, cbs: 0 },
  }

  const simulations = (classifiedItems || []).map(item => {
    const classif = (item as any).item_classifications?.[0]
    const cc = classif?.cclasstrib_code || '01'
    const reduction = REDUCTIONS[cc] || { ibs: 0, cbs: 0 }
    const rates = {
      ...DEFAULT_RATES,
      reduction_ibs: reduction.ibs,
      reduction_cbs: reduction.cbs,
    }
    const result = simulatePrice({
      cost: item.base_cost || 0,
      target_margin: targetMargin / 100,
      rates,
      legacy_tax_rate: legacyRate / 100,
    })
    return { item, classif, result }
  })

  const chartData = simulations.slice(0, 6).map(s => ({
    name: s.item.description.substring(0, 15) + '...',
    antes: parseFloat(s.result.tax_rate_before_pct.toFixed(2)),
    depois: parseFloat(s.result.tax_rate_after_pct.toFixed(2)),
  }))

  const saveMutation = useMutation({
    mutationFn: async () => {
      const scenarios = simulations.map(s => ({
        item_id: s.item.id,
        office_id: officeId!,
        company_id: s.item.company_id,
        scenario_name: 'Simulação IBS/CBS — ' + new Date().toLocaleDateString('pt-BR'),
        cost: s.item.base_cost || 0,
        target_margin: targetMargin / 100,
        price_before: s.result.price_before,
        price_after: s.result.price_after,
        tax_load_before: s.result.tax_load_before,
        tax_load_after: s.result.tax_load_after,
        created_by: user!.id,
      }))
      const { error } = await supabase.from('price_scenarios').insert(scenarios)
      if (error) throw error
    },
    onSuccess: () => toast.success('Simulações salvas com sucesso!'),
    onError: () => toast.error('Erro ao salvar simulações'),
  })

  function exportXLSX() {
    const rows = simulations.map(s => ({
      'Descrição': s.item.description,
      'NCM': s.item.ncm_current || '',
      'cClassTrib': s.classif?.cclasstrib_code || '',
      'Custo': s.item.base_cost,
      'Preço Anterior': s.result.price_before.toFixed(2),
      'Preço IBS/CBS': s.result.price_after.toFixed(2),
      'Carga Anterior (R$)': s.result.tax_load_before.toFixed(2),
      'Carga IBS/CBS (R$)': s.result.tax_load_after.toFixed(2),
      'Variação Preço': ((s.result.price_after / s.result.price_before - 1) * 100).toFixed(2) + '%',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Simulação IBS/CBS')
    XLSX.writeFile(wb, 'simulacao-ibscbs.xlsx')
    toast.success('Planilha exportada!')
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Simulador de Preços IBS/CBS</h1>
          <p className="text-gray-500 text-sm mt-1">Calcule o impacto da reforma tributária nos preços</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportXLSX} className="gap-2" disabled={!simulations.length}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button onClick={() => saveMutation.mutate()} className="gap-2" disabled={!simulations.length || saveMutation.isPending}>
            <Calculator className="h-4 w-4" /> {saveMutation.isPending ? 'Salvando...' : 'Salvar Cenário'}
          </Button>
        </div>
      </div>

      {/* Parameters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Parâmetros da Simulação</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {companies?.map(c => <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Carga Tributária Atual (%)</Label>
            <Input type="number" value={legacyRate} onChange={e => setLegacyRate(+e.target.value)} min={0} max={100} step={0.01} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Margem Alvo (%)</Label>
            <Input type="number" value={targetMargin} onChange={e => setTargetMargin(+e.target.value)} min={0} max={100} step={0.5} />
          </div>
          <div className="flex items-end">
            <div className="text-sm">
              <p className="text-gray-500">IBS padrão: <span className="font-semibold text-gray-900">20%</span></p>
              <p className="text-gray-500">CBS padrão: <span className="font-semibold text-gray-900">8,8%</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <TaxImpactChart data={chartData} title="Comparativo de Carga Tributária por Item" />
      )}

      {/* Results table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Resultado da Simulação</h3>
          <p className="text-xs text-gray-400 mt-0.5">Apenas itens classificados com custo informado</p>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 animate-pulse bg-gray-100 rounded-lg" />)}
          </div>
        ) : simulations.length === 0 ? (
          <div className="py-16 text-center">
            <Calculator className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Nenhum item classificado com custo informado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">cClassTrib</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Custo</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Preço Atual</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Preço IBS/CBS</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Variação</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Carga Nova</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {simulations.map(({ item, classif, result }) => {
                  const variation = result.price_before > 0 ? (result.price_after / result.price_before - 1) * 100 : 0
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="text-gray-900 font-medium truncate max-w-xs">{item.description}</p>
                        <p className="text-xs font-mono text-gray-400">{item.ncm_current}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="font-mono">{classif?.cclasstrib_code || '—'}</Badge>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">{formatCurrency(item.base_cost || 0)}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(result.price_before)}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">{formatCurrency(result.price_after)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`flex items-center justify-end gap-1 text-xs font-medium ${variation >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {variation >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {formatPercent(Math.abs(variation))}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">{formatPercent(result.tax_rate_after_pct)}</td>
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
