import { useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Tags, ChevronRight, CheckCircle } from 'lucide-react'

// Fallback data used when the database tables are empty
const CCLASSTRIB_FALLBACK = [
  { code: '01', description: 'Tributação Normal (alíquota cheia)', regime_type: 'normal', p_red_ibs: 0, p_red_cbs: 0 },
  { code: '02', description: 'Redução de 60% — Cesta Básica Ampliada', regime_type: 'reducao', p_red_ibs: 60, p_red_cbs: 60 },
  { code: '03', description: 'Redução de 100% — Cesta Básica Nacional', regime_type: 'isenta', p_red_ibs: 100, p_red_cbs: 100 },
  { code: '04', description: 'Redução de 30% — Saúde', regime_type: 'reducao', p_red_ibs: 30, p_red_cbs: 30 },
  { code: '05', description: 'Redução de 40% — Educação', regime_type: 'reducao', p_red_ibs: 40, p_red_cbs: 40 },
  { code: '06', description: 'Imune — Serviços Religiosos', regime_type: 'imune', p_red_ibs: 100, p_red_cbs: 100 },
  { code: '07', description: 'Monofásico — Combustíveis', regime_type: 'monofasica', p_red_ibs: 0, p_red_cbs: 0 },
]

const CST_FALLBACK = [
  { code: '01', description: 'Tributado integralmente' },
  { code: '02', description: 'Tributado com redução de alíquota' },
  { code: '03', description: 'Isento' },
  { code: '04', description: 'Imune' },
  { code: '05', description: 'Não tributado' },
]

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

  // Fetch cClassTrib from database, fallback to hardcoded if table is empty
  const { data: cclasstribOptions } = useQuery({
    queryKey: ['tax-cclasstrib'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tax_cclasstrib')
        .select('code, description, regime_type, p_red_ibs, p_red_cbs')
        .is('end_date', null)
        .order('code')
      return data && data.length > 0 ? data : CCLASSTRIB_FALLBACK
    },
    staleTime: 1000 * 60 * 60, // 1h cache
  })

  // Fetch CST from database, fallback to hardcoded if table is empty
  const { data: cstOptions } = useQuery({
    queryKey: ['tax-cst-ibs-cbs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tax_cst_ibs_cbs')
        .select('code, description')
        .order('code')
      return data && data.length > 0 ? data : CST_FALLBACK
    },
    staleTime: 1000 * 60 * 60,
  })

  const CCLASSTRIB_OPTIONS = cclasstribOptions || CCLASSTRIB_FALLBACK
  const CST_OPTIONS = cstOptions || CST_FALLBACK

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

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

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
      reset()
    },
    onError: () => toast.error('Erro ao classificar item'),
  })

  const selectedCst = watch('cst_ibs_cbs')
  const selectedCclass = watch('cclasstrib_code')

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Classificação Fiscal</h1>
        <p className="text-gray-500 text-sm mt-1">CST + cClassTrib — LC 214/2025</p>
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
                  onClick={() => { setSelectedItem(item); setStep(1) }}
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
                    <span className="hidden sm:inline">{['NCM/NBS', 'CST', 'cClassTrib', 'Justificativa'][s-1]}</span>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>NCM (mercadorias)</Label>
                        <Input {...register('ncm_used')} defaultValue={selectedItem.ncm_current || ''} placeholder="0000.00.00" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>NBS (serviços)</Label>
                        <Input {...register('nbs_used')} defaultValue={selectedItem.nbs_code || ''} placeholder="1.01.01.10" />
                      </div>
                    </div>
                    <Button type="button" onClick={() => setStep(2)}>Próximo</Button>
                  </div>
                )}

                {/* Step 2: CST */}
                {step === 2 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Passo 2 — Selecionar CST IBS/CBS</h3>
                    <div className="space-y-2">
                      {CST_OPTIONS.map(cst => (
                        <label key={cst.code} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedCst === cst.code ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input type="radio" {...register('cst_ibs_cbs')} value={cst.code} className="text-blue-600" />
                          <div>
                            <span className="font-mono text-xs text-gray-500 mr-2">{cst.code}</span>
                            <span className="text-sm text-gray-900">{cst.description}</span>
                          </div>
                        </label>
                      ))}
                      {errors.cst_ibs_cbs && <p className="text-xs text-red-500">{errors.cst_ibs_cbs.message}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                      <Button type="button" onClick={() => setStep(3)}>Próximo</Button>
                    </div>
                  </div>
                )}

                {/* Step 3: cClassTrib */}
                {step === 3 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Passo 3 — Selecionar cClassTrib</h3>
                    <div className="space-y-2">
                      {CCLASSTRIB_OPTIONS.map(cc => (
                        <label key={cc.code} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedCclass === cc.code ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input type="radio" {...register('cclasstrib_code')} value={cc.code} className="mt-0.5 text-blue-600" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-gray-500">{cc.code}</span>
                              <span className="text-sm font-medium text-gray-900">{cc.description}</span>
                            </div>
                            {(cc.p_red_ibs > 0 || cc.p_red_cbs > 0) && (
                              <p className="text-xs text-green-600 mt-0.5">
                                Redução IBS: {cc.p_red_ibs}% | Redução CBS: {cc.p_red_cbs}%
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                      {errors.cclasstrib_code && <p className="text-xs text-red-500">{errors.cclasstrib_code.message}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                      <Button type="button" onClick={() => setStep(4)}>Próximo</Button>
                    </div>
                  </div>
                )}

                {/* Step 4: Justification */}
                {step === 4 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Passo 4 — Justificativa</h3>
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
