import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useCClassTribBatch } from '@/hooks/useTaxSync'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, CheckCircle, AlertTriangle, Tags, Zap } from 'lucide-react'

interface ClassTribOption {
  cClassTrib: string
  description: string
  cstCode: string
  cstDescription: string
  articleRef: string
  pRedIBS: number | null
  pRedCBS: number | null
  indOp: string
  indicators: Record<string, unknown>
}

interface BatchItemResult {
  itemId: string
  ncmCode: string
  ncmDescription: string
  ncmValid: boolean
  ncmValidationMessage: string | null
  options: ClassTribOption[]
}

interface SelectedClassification {
  itemId: string
  cClassTrib: string
  cstCode: string
  description: string
}

export function BatchClassificationPanel() {
  const { officeId, user } = useAuth()
  const qc = useQueryClient()
  const { fetchBatchAsync, isFetching } = useCClassTribBatch()
  const [filterCompany, setFilterCompany] = useState('all')
  const [batchResults, setBatchResults] = useState<BatchItemResult[]>([])
  const [selections, setSelections] = useState<Map<string, SelectedClassification>>(new Map())

  // Fetch companies
  const { data: companies } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('client_companies').select('id, legal_name, trade_name').eq('office_id', officeId!) as any
      return (data as any[]) || []
    },
    enabled: !!officeId,
  })

  // Fetch pending items
  const { data: items, isLoading } = useQuery({
    queryKey: ['items-batch-classification', officeId, filterCompany],
    queryFn: async () => {
      let q = supabase
        .from('items')
        .select('id, description, ncm_current, nbs_code, is_service, company_id, client_companies(legal_name, trade_name)')
        .eq('office_id', officeId!)
        .neq('status', 'classified' as any)
        .not('ncm_current', 'is', null)
        .order('created_at', { ascending: false })
      if (filterCompany !== 'all') q = q.eq('company_id', filterCompany)
      const { data } = await q as any
      return (data as any[]) || []
    },
    enabled: !!officeId,
  })

  // Fetch batch classification options
  async function handleFetchBatch() {
    if (!items?.length) return toast.info('Nenhum item pendente com NCM')
    try {
      const batchInput = items.map((item: any) => ({
        item_id: item.id,
        ncm_code: item.ncm_current?.replace(/[.\-\s]/g, '') || '',
        is_service: item.is_service || false,
        nbs_code: item.nbs_code || undefined,
      }))
      const results = await fetchBatchAsync(batchInput)
      setBatchResults(results || [])
      setSelections(new Map())
      toast.success(`${results?.length || 0} itens processados`)
    } catch {
      toast.error('Erro ao buscar classificações em lote')
    }
  }

  // Select a classification for an item
  function selectOption(itemId: string, option: ClassTribOption) {
    const newSelections = new Map(selections)
    newSelections.set(itemId, {
      itemId,
      cClassTrib: option.cClassTrib,
      cstCode: option.cstCode,
      description: option.description,
    })
    setSelections(newSelections)
  }

  // Apply all selections as classifications
  const applyMutation = useMutation({
    mutationFn: async () => {
      const entries = Array.from(selections.values())
      if (entries.length === 0) throw new Error('Nenhuma classificação selecionada')

      for (const sel of entries) {
        const item = items?.find((i: any) => i.id === sel.itemId) as any
        if (!item) continue

        const { error: classErr } = await (supabase.from('item_classifications') as any).insert({
          item_id: sel.itemId,
          office_id: officeId!,
          company_id: item.company_id,
          ncm_used: item.ncm_current,
          nbs_used: item.nbs_code || null,
          cst_ibs_cbs: sel.cstCode,
          cclasstrib_code: sel.cClassTrib,
          justification: `Classificação em lote — ${sel.description}`,
          legal_refs: [],
          created_by: user!.id,
          status: 'approved',
        })
        if (classErr) throw classErr

        const { error: itemErr } = await (supabase.from('items') as any)
          .update({ status: 'classified' })
          .eq('id', sel.itemId)
        if (itemErr) throw itemErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items-batch-classification'] })
      qc.invalidateQueries({ queryKey: ['items-for-classification'] })
      qc.invalidateQueries({ queryKey: ['items'] })
      toast.success(`${selections.size} itens classificados com sucesso!`)
      setBatchResults([])
      setSelections(new Map())
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao aplicar classificações'),
  })

  const validItems = batchResults.filter(r => r.ncmValid && r.options.length > 0)
  const invalidItems = batchResults.filter(r => !r.ncmValid)
  const noOptions = batchResults.filter(r => r.ncmValid && r.options.length === 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Tags className="h-5 w-5 text-blue-600" />
            Classificação em Lote
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Busque cClassTrib automaticamente para todos os itens com NCM válido
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {companies?.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleFetchBatch} disabled={isFetching || isLoading} className="gap-2">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Buscar Classificações ({items?.length || 0} itens)
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      {batchResults.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <Badge variant="success" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            {validItems.length} com opções
          </Badge>
          {invalidItems.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {invalidItems.length} NCM inválido
            </Badge>
          )}
          {noOptions.length > 0 && (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {noOptions.length} sem opções
            </Badge>
          )}
          <Badge variant="outline">
            {selections.size} selecionados
          </Badge>
        </div>
      )}

      {/* Results table */}
      {batchResults.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">NCM</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">cClassTrib</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {batchResults.map((result) => {
                  const item = items?.find((i: any) => i.id === result.itemId) as any
                  const selected = selections.get(result.itemId)
                  return (
                    <tr key={result.itemId} className="hover:bg-gray-50">
                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-gray-900 truncate">{item?.description || result.itemId}</p>
                        {item?.client_companies && (
                          <p className="text-xs text-gray-400">{(item.client_companies as any)?.trade_name || (item.client_companies as any)?.legal_name}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-gray-600">
                        {result.ncmCode}
                        {result.ncmDescription && (
                          <p className="text-gray-400 font-sans truncate max-w-[200px]">{result.ncmDescription}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {result.ncmValid ? (
                          result.options.length > 0 ? (
                            <Badge variant="success" className="text-xs">
                              {result.options.length} opções
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="text-xs">Sem opções</Badge>
                          )
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            {result.ncmValidationMessage || 'Inválido'}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {result.options.length > 0 ? (
                          <Select
                            value={selected?.cClassTrib || ''}
                            onValueChange={(val) => {
                              const opt = result.options.find(o => o.cClassTrib === val)
                              if (opt) selectOption(result.itemId, opt)
                            }}
                          >
                            <SelectTrigger className="w-60 h-8 text-xs">
                              <SelectValue placeholder="Selecionar..." />
                            </SelectTrigger>
                            <SelectContent>
                              {result.options.map(opt => (
                                <SelectItem key={opt.cClassTrib} value={opt.cClassTrib}>
                                  <div className="flex items-center gap-2">
                                    <code className="font-mono text-xs">{opt.cClassTrib}</code>
                                    <span className="text-xs text-gray-500 truncate max-w-[200px]">{opt.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Apply all */}
          {selections.size > 0 && (
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">{selections.size}</span> itens selecionados para classificação
              </p>
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="gap-2"
              >
                {applyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Aplicar Classificações ({selections.size})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {batchResults.length === 0 && !isFetching && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <Tags className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            Clique em "Buscar Classificações" para processar os itens pendentes em lote
          </p>
        </div>
      )}
    </div>
  )
}
