import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NcmIssueTable, type NcmIssue } from '@/components/admin/NcmIssueTable'
import { KpiCardFiscal } from '@/components/admin/KpiCardFiscal'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle, Search, Download } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

export default function AdminNcmDiagnostics() {
  const { officeId } = useAuth()
  const [filterCompany, setFilterCompany] = useState('all')

  const { data: companies } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('client_companies').select('id, legal_name, trade_name').eq('office_id', officeId!)
      return data || []
    },
    enabled: !!officeId,
  })

  const { data: diagnostics, isLoading } = useQuery({
    queryKey: ['ncm-diagnostics', officeId, filterCompany],
    queryFn: async () => {
      let q = supabase
        .from('items')
        .select('id, description, ncm_current, ncm_validated, status, client_companies(id, legal_name, trade_name)')
        .eq('office_id', officeId!)
      if (filterCompany !== 'all') q = q.eq('company_id', filterCompany)
      const { data } = await q
      const all = data || []

      const issues: NcmIssue[] = []
      const withNcm: typeof all = []
      const valid: typeof all = []

      for (const item of all) {
        const company = (item as any).client_companies
        const companyName = company?.trade_name || company?.legal_name || '—'
        if (!item.ncm_current) {
          issues.push({ item_id: item.id, description: item.description, ncm_current: null, issue_type: 'missing_ncm', company_name: companyName })
        } else {
          withNcm.push(item)
          valid.push(item)
        }
      }

      return {
        issues,
        totalItems: all.length,
        withoutNcm: issues.filter(i => i.issue_type === 'missing_ncm').length,
        withNcm: withNcm.length,
        valid: valid.length,
      }
    },
    enabled: !!officeId,
  })

  function exportXLSX() {
    if (!diagnostics?.issues.length) return toast.info('Nenhuma pendência para exportar')
    const rows = diagnostics.issues.map(i => ({
      'Empresa': i.company_name,
      'Descrição': i.description,
      'NCM Atual': i.ncm_current || '',
      'Problema': i.issue_type === 'missing_ncm' ? 'Sem NCM' : 'NCM Inválido',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Diagnóstico NCM')
    XLSX.writeFile(wb, 'diagnostico-ncm.xlsx')
    toast.success('Relatório exportado!')
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Diagnóstico NCM/NBS</h1>
          <p className="text-gray-500 text-sm mt-1">Identifique e corrija problemas de classificação</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportXLSX} className="gap-2">
            <Download className="h-4 w-4" /> Exportar XLSX
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Filtrar empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companies?.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCardFiscal
          title="Total de Itens"
          value={isLoading ? '—' : diagnostics?.totalItems || 0}
          icon={Search}
          loading={isLoading}
        />
        <KpiCardFiscal
          title="Sem NCM"
          value={isLoading ? '—' : diagnostics?.withoutNcm || 0}
          subtitle="Requerem ação"
          icon={AlertTriangle}
          variant={diagnostics?.withoutNcm ? 'warning' : 'success'}
          loading={isLoading}
        />
        <KpiCardFiscal
          title="Com NCM"
          value={isLoading ? '—' : diagnostics?.withNcm || 0}
          icon={CheckCircle}
          variant="success"
          loading={isLoading}
        />
        <KpiCardFiscal
          title="Taxa de Cobertura"
          value={isLoading ? '—' : diagnostics?.totalItems
            ? `${Math.round((diagnostics.withNcm / diagnostics.totalItems) * 100)}%`
            : '0%'}
          subtitle="NCM informado"
          icon={CheckCircle}
          variant={diagnostics?.withoutNcm === 0 ? 'success' : 'default'}
          loading={isLoading}
        />
      </div>

      {/* Issues Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Itens com Pendência</h3>
            {diagnostics?.withoutNcm ? (
              <Badge variant="warning">{diagnostics.withoutNcm}</Badge>
            ) : (
              <Badge variant="success">OK</Badge>
            )}
          </div>
        </div>
        <div className="p-5">
          <NcmIssueTable issues={diagnostics?.issues || []} loading={isLoading} />
        </div>
      </div>
    </div>
  )
}
