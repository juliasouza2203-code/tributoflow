import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency } from '@/lib/utils'
import { FileText, Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { generateClassificationReportPDF } from '@/lib/pdf/generateAuditReportPDF'

export default function AdminReports() {
  const { officeId, profile } = useAuth()
  const [filterCompany, setFilterCompany] = useState('all')

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

  function exportClassifications() {
    if (!classifications?.length) return toast.info('Sem dados para exportar')
    const rows = classifications.map((c: any) => ({
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
    if (!classifications?.length) return toast.info('Sem dados para exportar')
    const rows = classifications.map((c: any) => ({
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
      ? companies?.find(c => c.id === filterCompany)
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

      <div className="flex gap-3">
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Filtrar empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {companies?.map(c => <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Classifications table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Mapa de Classificações</h3>
          <Badge variant="secondary">{classifications?.length || 0} registros</Badge>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 animate-pulse bg-gray-100 rounded-lg" />)}
          </div>
        ) : classifications?.length === 0 ? (
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
                {classifications?.map((c: any) => (
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
