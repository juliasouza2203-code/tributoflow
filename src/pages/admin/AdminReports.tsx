import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency } from '@/lib/utils'
import { FileText, Download, BarChart2, Users, Package, TrendingUp } from 'lucide-react'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { generateClassificationReportPDF } from '@/lib/pdf/generateAuditReportPDF'

export default function AdminReports() {
  const { officeId, profile } = useAuth()
  const [filterCompany, setFilterCompany] = useState('all')
  const [filterProduct, setFilterProduct] = useState('')

  const { data: companies } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('client_companies').select('id, legal_name, trade_name').eq('office_id', officeId!) as any
      return (data as any[]) || []
    },
    enabled: !!officeId,
  })

  const { data: office } = useQuery({
    queryKey: ['office', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('offices').select('name').eq('id', officeId!).single()
      return data
    },
    enabled: !!officeId,
  })

  const { data: classifications, isLoading } = useQuery({
    queryKey: ['classifications', officeId, filterCompany],
    queryFn: async () => {
      let q = supabase
        .from('item_classifications')
        .select('*, items(description, ncm_current, base_cost), client_companies(legal_name, trade_name), profiles(full_name)')
        .eq('office_id', officeId!)
        .order('created_at', { ascending: false })
      if (filterCompany !== 'all') q = q.eq('company_id', filterCompany)
      const { data } = await q
      return data || []
    },
    enabled: !!officeId,
  })

  const { data: companySummary } = useQuery({
    queryKey: ['company-summary', officeId, filterCompany],
    queryFn: async () => {
      const { data } = await supabase
        .from('items')
        .select('id, status, base_cost, ncm_current')
        .eq('office_id', officeId!)
        .eq('company_id', filterCompany)
      return data || []
    },
    enabled: !!officeId && filterCompany !== 'all',
  })

  const { data: auditLogs } = useQuery({
    queryKey: ['audit-logs', officeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('office_id', officeId!)
        .order('created_at', { ascending: false })
        .limit(20)
      return data || []
    },
    enabled: !!officeId,
  })

  // Client-side filter by product description
  const filteredClassifications = useMemo(() => {
    if (!classifications) return []
    if (!filterProduct.trim()) return classifications
    const term = filterProduct.trim().toLowerCase()
    return classifications.filter((c: any) =>
      (c.items?.description || '').toLowerCase().includes(term)
    )
  }, [classifications, filterProduct])

  // Company summary KPIs
  const kpis = useMemo(() => {
    if (!companySummary) return null
    const total = companySummary.length
    const classified = companySummary.filter((i: any) => i.status === 'classified' || i.status === 'approved').length
    const pending = total - classified
    const classifiedPct = total > 0 ? Math.round((classified / total) * 100) : 0
    const costsWithValue = companySummary.filter((i: any) => i.base_cost != null)
    const avgCost = costsWithValue.length > 0
      ? costsWithValue.reduce((sum: number, i: any) => sum + Number(i.base_cost), 0) / costsWithValue.length
      : 0
    const uniqueNcms = new Set(companySummary.map((i: any) => i.ncm_current).filter(Boolean)).size
    return { total, classified, classifiedPct, pending, avgCost, uniqueNcms }
  }, [companySummary])

  function exportClassifications() {
    if (!filteredClassifications?.length) return toast.info('Sem dados para exportar')
    const rows = filteredClassifications.map((c: any) => ({
      'Item': c.items?.description || '',
      'NCM Usado': c.ncm_used || '',
      'CST': c.cst_ibs_cbs || '',
      'cClassTrib': c.cclasstrib_code || '',
      'Justificativa': c.justification || '',
      'Responsável': c.profiles?.full_name || '',
      'Status': c.status,
      'Data': formatDate(c.created_at),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Classificações')
    XLSX.writeFile(wb, 'mapa-classificacoes.xlsx')
    toast.success('Relatório exportado!')
  }

  function exportPDF() {
    if (!filteredClassifications?.length) return toast.info('Sem dados para exportar')
    const rows = filteredClassifications.map((c: any) => ({
      itemDescription: c.items?.description || '',
      companyName: (c.client_companies as any)?.trade_name || (c.client_companies as any)?.legal_name || '',
      ncmUsed: c.ncm_used || '',
      cstCode: c.cst_ibs_cbs || '',
      cclasstribCode: c.cclasstrib_code || '',
      justification: c.justification || '',
      responsavel: c.profiles?.full_name || '',
      data: formatDate(c.created_at),
      status: c.status,
    }))

    const selectedCompany = filterCompany !== 'all'
      ? companies?.find((c: any) => c.id === filterCompany)
      : null

    generateClassificationReportPDF({
      officeName: office?.name || 'Escritório',
      generatedBy: profile?.full_name || 'Usuário',
      filterCompany: selectedCompany ? (selectedCompany.trade_name || selectedCompany.legal_name) : 'Todas',
      classifications: rows,
    })
    toast.success('Laudo PDF gerado!')
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios e Auditoria</h1>
          <p className="text-gray-500 text-sm mt-1">Histórico de classificações e trilha de auditoria</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportPDF} className="gap-2">
            <FileText className="h-4 w-4" /> Exportar PDF
          </Button>
          <Button variant="outline" onClick={exportClassifications} className="gap-2">
            <Download className="h-4 w-4" /> Exportar XLSX
          </Button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Filtrar empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {companies?.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            className="pl-9 w-64"
            placeholder="Buscar produto / item..."
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
          />
        </div>
      </div>

      {/* Company KPI cards — shown only when a company is selected */}
      {filterCompany !== 'all' && kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="border border-gray-200 rounded-xl bg-white p-4 shadow-sm flex flex-col gap-1">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
              <Users className="h-4 w-4 text-blue-400" />
              Total Itens
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpis.total}</p>
            <p className="text-xs text-gray-400">importados</p>
          </div>

          <div className="border border-gray-200 rounded-xl bg-white p-4 shadow-sm flex flex-col gap-1">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
              <BarChart2 className="h-4 w-4 text-green-400" />
              Classificados
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpis.classified}</p>
            <p className="text-xs text-gray-400">{kpis.classifiedPct}% do total</p>
          </div>

          <div className="border border-gray-200 rounded-xl bg-white p-4 shadow-sm flex flex-col gap-1">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
              <FileText className="h-4 w-4 text-yellow-400" />
              Pendentes
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpis.pending}</p>
            <p className="text-xs text-gray-400">aguardando classificação</p>
          </div>

          <div className="border border-gray-200 rounded-xl bg-white p-4 shadow-sm flex flex-col gap-1">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              Custo Médio
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(kpis.avgCost)}</p>
            <p className="text-xs text-gray-400">base_cost médio</p>
          </div>

          <div className="border border-gray-200 rounded-xl bg-white p-4 shadow-sm flex flex-col gap-1">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
              <Package className="h-4 w-4 text-orange-400" />
              NCMs Únicos
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpis.uniqueNcms}</p>
            <p className="text-xs text-gray-400">utilizados</p>
          </div>
        </div>
      )}

      {/* Classifications table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Mapa de Classificações</h3>
          <Badge variant="secondary">{filteredClassifications?.length || 0} registros</Badge>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 animate-pulse bg-gray-100 rounded-lg" />)}
          </div>
        ) : filteredClassifications?.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nenhuma classificação registrada ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">NCM</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">CST</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">cClassTrib</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Responsável</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredClassifications?.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-900 max-w-xs truncate">{c.items?.description || '—'}</td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-600">{c.ncm_used || '—'}</td>
                    <td className="py-3 px-4"><Badge variant="secondary" className="font-mono text-xs">{c.cst_ibs_cbs || '—'}</Badge></td>
                    <td className="py-3 px-4"><Badge variant="default" className="font-mono text-xs">{c.cclasstrib_code || '—'}</Badge></td>
                    <td className="py-3 px-4">
                      <Badge variant={c.status === 'approved' ? 'success' : 'secondary'} className="text-xs">
                        {c.status === 'approved' ? 'Aprovado' : c.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{c.profiles?.full_name || '—'}</td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{formatDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Trilha de Auditoria (últimas 20 ações)</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {auditLogs?.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Sem registros de auditoria.</p>
          ) : (
            auditLogs?.map((log: any) => (
              <div key={log.id} className="flex items-center gap-4 p-4 hover:bg-gray-50">
                <Badge variant={log.action === 'delete' ? 'destructive' : 'secondary'} className="text-xs shrink-0">
                  {log.action}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{log.entity_type} — <span className="font-mono text-xs">{log.entity_id}</span></p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{formatDate(log.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
