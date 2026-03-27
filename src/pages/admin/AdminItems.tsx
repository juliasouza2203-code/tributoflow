import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Upload, Search, Package, Building2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { ItemStatus } from '@/integrations/supabase/types'

const statusLabels: Record<ItemStatus, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  in_review: { label: 'Em Revisão', variant: 'warning' },
  classified: { label: 'Classificado', variant: 'success' },
}

export default function AdminItems() {
  const { officeId } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterCompany, setFilterCompany] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadCompanyId, setUploadCompanyId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: companies } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('client_companies').select('id, legal_name, trade_name').eq('office_id', officeId!)
      return data || []
    },
    enabled: !!officeId,
  })

  const { data: items, isLoading } = useQuery({
    queryKey: ['items', officeId, filterCompany, filterStatus],
    queryFn: async () => {
      let q = supabase
        .from('items')
        .select('*, client_companies(legal_name, trade_name)')
        .eq('office_id', officeId!)
        .order('created_at', { ascending: false })
      if (filterCompany !== 'all') q = q.eq('company_id', filterCompany)
      if (filterStatus !== 'all') q = q.eq('status', filterStatus)
      const { data } = await q
      return data || []
    },
    enabled: !!officeId,
  })

  const importMutation = useMutation({
    mutationFn: async ({ rows, companyId }: { rows: any[]; companyId: string }) => {
      if (!companyId) throw new Error('Selecione uma empresa antes de importar')

      const items = rows.map(r => ({
        office_id: officeId!,
        company_id: companyId,
        description: r.descricao || r.description || r.Descricao || '',
        code: r.codigo || r.code || r.SKU || null,
        item_type: (r.tipo || r.type || 'goods') === 'services' ? 'services' : 'goods',
        ncm_current: r.ncm || r.NCM || null,
        unit: r.unidade || r.unit || null,
        base_cost: parseFloat(r.custo || r.cost || 0) || null,
        status: 'pending' as ItemStatus,
      }))

      const { error } = await supabase.from('items').insert(items)
      if (error) throw error
      return items.length
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['items'] })
      toast.success(`${count} itens importados com sucesso!`)
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao importar itens'),
  })

  function handleUploadClick() {
    if (filterCompany === 'all') {
      setUploadCompanyId('')
      setShowUploadDialog(true)
    } else {
      fileRef.current?.click()
    }
  }

  function handleDialogConfirm() {
    if (!uploadCompanyId) {
      toast.error('Selecione uma empresa para continuar.')
      return
    }
    setShowUploadDialog(false)
    // Use a slight delay so dialog closes before file picker opens
    setTimeout(() => fileRef.current?.click(), 100)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Determine which company to use: dialog selection or current filter
    const companyId = filterCompany !== 'all' ? filterCompany : uploadCompanyId
    if (!companyId) {
      toast.error('Nenhuma empresa selecionada. Por favor, selecione uma empresa antes de importar.')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws)
      importMutation.mutate({ rows, companyId })
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
    // Reset dialog company selection after use
    setUploadCompanyId('')
  }

  const filtered = (items || []).filter(i =>
    i.description.toLowerCase().includes(search.toLowerCase()) ||
    (i.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.ncm_current || '').includes(search)
  )

  const selectedCompany = filterCompany !== 'all'
    ? companies?.find(c => c.id === filterCompany)
    : null

  const classifiedCount = filtered.filter(i => i.status === 'classified').length
  const pendingCount = filtered.filter(i => i.status === 'pending').length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Upload Company Selection Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              Selecionar Empresa para Importação
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-gray-500">
              Nenhuma empresa está selecionada. Escolha para qual empresa os itens da planilha serão importados.
            </p>
            <Select value={uploadCompanyId} onValueChange={setUploadCompanyId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione uma empresa..." />
              </SelectTrigger>
              <SelectContent>
                {companies?.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.trade_name || c.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleDialogConfirm} disabled={!uploadCompanyId}>
              <Upload className="h-4 w-4 mr-2" />
              Confirmar e Selecionar Arquivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Itens / Produtos</h1>
          <p className="text-gray-500 text-sm mt-1">{items?.length || 0} itens cadastrados</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          <Button variant="outline" onClick={handleUploadClick} className="gap-2" disabled={importMutation.isPending}>
            <Upload className="h-4 w-4" />
            {importMutation.isPending ? 'Importando...' : 'Importar XLSX'}
          </Button>
          <Button className="gap-2" disabled>
            <Plus className="h-4 w-4" /> Novo item
          </Button>
        </div>
      </div>

      {/* Prominent Company Selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-blue-600 shrink-0" />
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
              Cliente / Empresa
            </label>
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger className="w-full max-w-sm border-blue-200 focus:ring-blue-500">
                <SelectValue placeholder="Selecione uma empresa..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {companies?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filterCompany !== 'all' && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-gray-500"
              onClick={() => setFilterCompany('all')}
            >
              Ver todos
            </Button>
          )}
        </div>
      </div>

      {/* Company Stats Bar (shown when a company is selected) */}
      {selectedCompany && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-blue-900 text-base">
              {selectedCompany.trade_name || selectedCompany.legal_name}
            </span>
          </div>
          <div className="flex gap-5 text-sm">
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-blue-700">{filtered.length}</span>
              <span className="text-xs text-blue-500">Total de Itens</span>
            </div>
            <div className="w-px bg-blue-200" />
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-green-600">{classifiedCount}</span>
              <span className="text-xs text-green-500">Classificados</span>
            </div>
            <div className="w-px bg-blue-200" />
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-amber-500">{pendingCount}</span>
              <span className="text-xs text-amber-500">Pendentes</span>
            </div>
          </div>
        </div>
      )}

      {/* Search & Status Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar por descrição, código, NCM..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="in_review">Em Revisão</SelectItem>
            <SelectItem value="classified">Classificado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-14 animate-pulse bg-gray-100 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Nenhum item encontrado.</p>
            <p className="text-xs text-gray-400 mt-1">Importe uma planilha XLSX para começar.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Descrição</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Código</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">NCM</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Empresa</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item: any) => {
                const { label, variant } = statusLabels[item.status as ItemStatus]
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-900 max-w-xs truncate">{item.description}</td>
                    <td className="py-3 px-4 font-mono text-gray-500 text-xs">{item.code || '—'}</td>
                    <td className="py-3 px-4 font-mono text-gray-600">{item.ncm_current || <span className="text-red-400">Sem NCM</span>}</td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary" className="text-xs">{item.item_type === 'services' ? 'Serviço' : 'Mercadoria'}</Badge>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs">
                      {item.client_companies?.trade_name || item.client_companies?.legal_name || '—'}
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
