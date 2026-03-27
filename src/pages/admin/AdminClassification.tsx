import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Tags, ChevronRight, CheckCircle, Loader2, ExternalLink, AlertCircle, RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { consultarNcmCff, type CffCard } from '@/integrations/fiscal/consulta-cff'

// CST groups from LC 214/2025 — maps 3-digit prefix to label
const CST_GROUP_LABELS: Record<string, string> = {
  '000': 'Tributado integralmente (CST 000)',
  '010': 'Tributado com crédito presumido (CST 010)',
  '011': 'Tributado — regimes específicos (CST 011)',
  '200': 'Redução de alíquota (CST 200)',
  '220': 'Redução — regime específico (CST 220)',
  '221': 'Redução — cooperativas (CST 221)',
  '222': 'Redução — exportação (CST 222)',
  '400': 'Isento (CST 400)',
  '410': 'Isento — regimes específicos (CST 410)',
  '510': 'Imune (CST 510)',
  '515': 'Imune — regime específico (CST 515)',
  '550': 'Não incide / fora do campo (CST 550)',
  '620': 'Monofásico — tributado (CST 620)',
  '800': 'Monofásico — isento (CST 800)',
  '810': 'Monofásico — imune (CST 810)',
  '811': 'Monofásico — regime específico (CST 811)',
  '820': 'Monofásico — suspensão (CST 820)',
  '830': 'Monofásico — diferido (CST 830)',
}

const schema = z.object({
  ncm_used: z.string().optional(),
  nbs_used: z.string().optional(),
  cst_ibs_cbs: z.string().min(1, 'Selecione o CST'),
  cclasstrib_code: z.string().min(1, 'Selecione o cClassTrib'),
  justification: z.string().min(10, 'Justificativa obrigatória (mín. 10 caracteres)'),
})
type FormData = z.infer<typeof schema>

export default function AdminClassification() {
  const { officeId, user } = useAuth()
  const qc = useQueryClient()
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [step, setStep] = useState(1)
  const [filterCompany, setFilterCompany] = useState('all')

  // CFF portal data for step 3
  const [cffCards, setCffCards] = useState<CffCard[]>([])
  const [cffLoading, setCffLoading] = useState(false)
  const [cffError, setCffError] = useState<string | null>(null)
  const [confirmedNcm, setConfirmedNcm] = useState<string>('')

  // NCM search panel (Step 1)
  const [ncmSearchOpen, setNcmSearchOpen] = useState(false)
  const [ncmSearchQuery, setNcmSearchQuery] = useState('')
  const [ncmSearchResults, setNcmSearchResults] = useState<{ code: string; description: string }[]>([])
  const [ncmSearchLoading, setNcmSearchLoading] = useState(false)

  const { data: companies } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('client_companies').select('id, legal_name, trade_name').eq('office_id', officeId!) as any
      return (data as any[]) || []
    },
    enabled: !!officeId,
  })

  const { data: items, isLoading } = useQuery({
    queryKey: ['items-for-classification', officeId, filterCompany],
    queryFn: async () => {
      let q = supabase
        .from('items')
        .select('*, client_companies(legal_name, trade_name)')
        .eq('office_id', officeId!)
        .neq('status', 'classified' as any)
        .order('created_at', { ascending: false })
      if (filterCompany !== 'all') q = q.eq('company_id', filterCompany)
      const { data } = await q as any
      return (data as any[]) || []
    },
    enabled: !!officeId,
  })

  const { register, handleSubmit, watch, reset, setValue, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const selectedCst = watch('cst_ibs_cbs')
  const selectedCclass = watch('cclasstrib_code')

  // NCM search: debounce query then hit tax_ncm table
  async function searchNcm(query: string) {
    if (!query || query.trim().length < 2) {
      setNcmSearchResults([])
      return
    }
    setNcmSearchLoading(true)
    const { data } = await (supabase as any)
      .from('tax_ncm')
      .select('code, description')
      .ilike('description', `%${query.trim()}%`)
      .is('end_date', null)
      .limit(10)
    setNcmSearchResults((data as { code: string; description: string }[]) || [])
    setNcmSearchLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(() => { searchNcm(ncmSearchQuery) }, 400)
    return () => clearTimeout(timer)
  }, [ncmSearchQuery])

  // Group CFF cards by CST prefix (first 3 digits of cclasstrib)
  const groupedCards = cffCards.reduce<Record<string, CffCard[]>>((acc, card) => {
    const cstKey = card.cst
    if (!acc[cstKey]) acc[cstKey] = []
    acc[cstKey].push(card)
    return acc
  }, {})

  // Fetch CFF cards when entering step 3
  async function fetchCffCards(ncm: string) {
    if (!ncm || ncm.replace(/[.\-\s]/g, '').length < 4) {
      setCffError('NCM inválido para consultar o portal CFF')
      return
    }
    setCffLoading(true)
    setCffError(null)
    setCffCards([])
    try {
      const result = await consultarNcmCff(ncm)
      if (result.error) throw new Error(result.error)
      if (result.cards.length === 0) {
        setCffError('Nenhuma classificação encontrada para este NCM no portal CFF.')
      } else {
        setCffCards(result.cards)
      }
    } catch (err: any) {
      setCffError(err.message || 'Não foi possível consultar o portal CFF.')
    }
    setCffLoading(false)
  }

  // When a CFF card is clicked, set both cst and cclasstrib
  function selectCffCard(card: CffCard) {
    setValue('cst_ibs_cbs', card.cst)
    setValue('cclasstrib_code', card.cclasstrib)
  }

  function goToStep2() {
    const ncm = getValues('ncm_used') || selectedItem?.ncm_current || ''
    setConfirmedNcm(ncm)
    setStep(2)
  }

  function goToStep3() {
    const ncm = confirmedNcm || getValues('ncm_used') || selectedItem?.ncm_current || ''
    fetchCffCards(ncm)
    setStep(3)
  }

  const classifyMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error: classErr } = await (supabase.from('item_classifications') as any).insert({
        item_id: selectedItem.id,
        office_id: officeId!,
        company_id: selectedItem.company_id,
        ncm_used: data.ncm_used || selectedItem.ncm_current,
        nbs_used: data.nbs_used || selectedItem.nbs_code,
        cst_ibs_cbs: data.cst_ibs_cbs,
        cclasstrib_code: data.cclasstrib_code,
        justification: data.justification,
        legal_refs: [],
        created_by: user!.id,
        status: 'approved',
      })
      if (classErr) throw classErr
      const { error: itemErr } = await (supabase.from('items') as any).update({ status: 'classified' }).eq('id', selectedItem.id)
      if (itemErr) throw itemErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items-for-classification'] })
      qc.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item classificado com sucesso!')
      setSelectedItem(null)
      setStep(1)
      setCffCards([])
      reset()
    },
    onError: () => toast.error('Erro ao classificar item'),
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Classificação Fiscal</h1>
        <p className="text-gray-500 text-sm mt-1">CST + cClassTrib — LC 214/2025 · Dados do Portal Conformidade Fácil (SVRS)</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Items list */}
        <div className="lg:col-span-1 space-y-3">
          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger><SelectValue placeholder="Filtrar empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {companies?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-h-[600px] overflow-y-auto">
            <div className="p-3 border-b border-gray-200 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase">Itens Pendentes ({items?.length || 0})</p>
            </div>
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-14 animate-pulse bg-gray-100 rounded" />)}
              </div>
            ) : items?.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Todos classificados!</p>
              </div>
            ) : (
              items?.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setSelectedItem(item); setStep(1); setCffCards([]); reset() }}
                  className={`w-full text-left p-4 border-b border-gray-100 hover:bg-blue-50 transition-colors ${selectedItem?.id === item.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{item.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono text-gray-400">{item.ncm_current || 'Sem NCM'}</span>
                    <ChevronRight className="h-3 w-3 text-gray-300 ml-auto" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Wizard */}
        <div className="lg:col-span-2">
          {!selectedItem ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-96 flex items-center justify-center">
              <div className="text-center">
                <Tags className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Selecione um item para classificar</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              {/* Steps indicator */}
              <div className="flex border-b border-gray-200 p-4 gap-4">
                {[1, 2, 3, 4].map(s => (
                  <div key={s} className={`flex items-center gap-1.5 text-sm ${step === s ? 'text-blue-600 font-semibold' : step > s ? 'text-green-600' : 'text-gray-400'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
                    <span className="hidden sm:inline">{['NCM/NBS', 'Contexto', 'cClassTrib', 'Justificativa'][s-1]}</span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSubmit(d => classifyMutation.mutate(d))} className="p-6 space-y-6">
                {/* Item info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-900">{selectedItem.description}</p>
                  <p className="text-xs text-gray-400 mt-1 font-mono">NCM atual: {selectedItem.ncm_current || 'Não informado'}</p>
                </div>

                {/* Step 1: NCM/NBS */}
                {step === 1 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Passo 1 — Confirmar NCM/NBS</h3>
                    <p className="text-xs text-gray-500">O NCM será usado para consultar as classificações aplicáveis no Portal Conformidade Fácil.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>NCM (mercadorias)</Label>
                        <Input {...register('ncm_used')} defaultValue={selectedItem.ncm_current || ''} placeholder="00000000" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>NBS (serviços)</Label>
                        <Input {...register('nbs_used')} defaultValue={selectedItem.nbs_code || ''} placeholder="1.01.01.10" />
                      </div>
                    </div>
                    {/* NCM lookup panel */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => { setNcmSearchOpen(o => !o); setNcmSearchQuery(''); setNcmSearchResults([]) }}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                      >
                        <span className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-gray-400" />
                          Buscar NCM na tabela oficial
                        </span>
                        {ncmSearchOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </button>

                      {ncmSearchOpen && (
                        <div className="p-4 space-y-3 border-t border-gray-200">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                            <Input
                              value={ncmSearchQuery}
                              onChange={e => setNcmSearchQuery(e.target.value)}
                              placeholder="Digite uma palavra-chave (ex: soja, calçado, software...)"
                              className="pl-9"
                              autoFocus
                            />
                          </div>

                          {ncmSearchLoading && (
                            <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Buscando…
                            </div>
                          )}

                          {!ncmSearchLoading && ncmSearchResults.length === 0 && ncmSearchQuery.trim().length >= 2 && (
                            <p className="text-xs text-gray-400 py-2">Nenhum NCM encontrado para "{ncmSearchQuery}".</p>
                          )}

                          {!ncmSearchLoading && ncmSearchResults.length > 0 && (
                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                              {ncmSearchResults.map(r => (
                                <div
                                  key={r.code}
                                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                                >
                                  <div className="flex items-start gap-2 min-w-0">
                                    <code className="text-xs font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                                      {r.code}
                                    </code>
                                    <p className="text-xs text-gray-700 leading-snug">{r.description}</p>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0 h-7 text-xs"
                                    onClick={() => {
                                      setValue('ncm_used', r.code)
                                      setNcmSearchOpen(false)
                                      setNcmSearchQuery('')
                                      setNcmSearchResults([])
                                    }}
                                  >
                                    Usar este NCM
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <Button type="button" onClick={goToStep2}>Próximo</Button>
                  </div>
                )}

                {/* Step 2: Document type / operation context */}
                {step === 2 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Passo 2 — Tipo de Documento Fiscal</h3>
                    <p className="text-xs text-gray-500">Selecione o tipo de documento. Isso filtra os cClassTrib aplicáveis no portal.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'NFE', label: 'NF-e', sub: 'Nota Fiscal Eletrônica' },
                        { value: 'NFCE', label: 'NFC-e', sub: 'Nota Fiscal ao Consumidor' },
                      ].map(opt => (
                        <label key={opt.value} className="flex flex-col gap-1 p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors">
                          <input type="radio" name="dfeType" value={opt.value} defaultChecked={opt.value === 'NFE'} className="sr-only" onChange={() => setValue('cst_ibs_cbs', '')} />
                          <span className="font-semibold text-gray-900">{opt.label}</span>
                          <span className="text-xs text-gray-500">{opt.sub}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                      <Button type="button" onClick={goToStep3}>Consultar Portal CFF</Button>
                    </div>
                  </div>
                )}

                {/* Step 3: cClassTrib from CFF portal */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">Passo 3 — Selecionar cClassTrib</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Classificações do Portal Conformidade Fácil para NCM <code className="bg-gray-100 px-1 rounded font-mono">{confirmedNcm || selectedItem.ncm_current}</code>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributariaNcm?ncm=${(confirmedNcm || selectedItem.ncm_current || '').replace(/[.\-\s]/g,'')}&dfeTypes=NFE`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Ver no Portal
                        </a>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchCffCards(confirmedNcm || selectedItem.ncm_current || '')}
                          disabled={cffLoading}
                          className="h-7 gap-1 text-xs"
                        >
                          <RefreshCw className={`h-3 w-3 ${cffLoading ? 'animate-spin' : ''}`} />
                          Atualizar
                        </Button>
                      </div>
                    </div>

                    {/* Loading */}
                    {cffLoading && (
                      <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Consultando Portal Conformidade Fácil…</span>
                      </div>
                    )}

                    {/* Error */}
                    {!cffLoading && cffError && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">Erro ao consultar portal</p>
                          <p className="text-xs text-amber-700 mt-1">{cffError}</p>
                          <p className="text-xs text-amber-600 mt-2">Informe o cClassTrib manualmente ou acesse o portal diretamente.</p>
                          <Input
                            className="mt-2 h-8 text-xs font-mono w-40"
                            placeholder="Ex: 000001"
                            onChange={e => setValue('cclasstrib_code', e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {/* Cards from CFF portal */}
                    {!cffLoading && cffCards.length > 0 && (
                      <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                        {Object.entries(groupedCards).map(([cst, cards]) => (
                          <div key={cst}>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2 sticky top-0 bg-white py-1">
                              {CST_GROUP_LABELS[cst] || `CST ${cst}`}
                            </p>
                            <div className="space-y-1.5">
                              {cards.map(card => {
                                const isSelected = selectedCclass === card.cclasstrib
                                return (
                                  <label
                                    key={card.cclasstrib}
                                    onClick={() => selectCffCard(card)}
                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                                  >
                                    <input
                                      type="radio"
                                      {...register('cclasstrib_code')}
                                      value={card.cclasstrib}
                                      checked={isSelected}
                                      onChange={() => selectCffCard(card)}
                                      className="mt-1 text-blue-600 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <code className="text-xs font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                          {card.cclasstrib}
                                        </code>
                                        {card.badge && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-500">{card.badge}</Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-700 mt-1 leading-relaxed">{card.description}</p>
                                      <a
                                        href={card.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline mt-1"
                                      >
                                        <ExternalLink className="h-2.5 w-2.5" /> Ver no portal
                                      </a>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {errors.cclasstrib_code && <p className="text-xs text-red-500">{errors.cclasstrib_code.message}</p>}

                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                      <Button type="button" onClick={() => setStep(4)} disabled={!selectedCclass}>
                        Próximo
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 4: Justification */}
                {step === 4 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Passo 4 — Justificativa</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                      <p><span className="font-semibold">CST:</span> {selectedCst || '—'}</p>
                      <p><span className="font-semibold">cClassTrib:</span> {selectedCclass || '—'}</p>
                      {cffCards.find(c => c.cclasstrib === selectedCclass) && (
                        <p><span className="font-semibold">Descrição:</span> {cffCards.find(c => c.cclasstrib === selectedCclass)?.description}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Justificativa da classificação *</Label>
                      <Textarea
                        {...register('justification')}
                        rows={4}
                        placeholder="Explique o fundamento legal da classificação escolhida (artigo da LC 214/2025, etc.)..."
                      />
                      {errors.justification && <p className="text-xs text-red-500">{errors.justification.message}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setStep(3)}>Voltar</Button>
                      <Button type="submit" disabled={classifyMutation.isPending}>
                        {classifyMutation.isPending ? 'Salvando...' : 'Confirmar Classificação'}
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
