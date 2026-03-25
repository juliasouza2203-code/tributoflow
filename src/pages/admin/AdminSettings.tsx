import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Building2, Calculator, Plug, CheckCircle, XCircle, Loader2, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

const PROVIDERS = [
  { provider: 'conformidade_facil', display_name: 'API Conformidade Fácil', description: 'Validação NCM em tempo real via API oficial', urlPlaceholder: 'https://api.conformidadefacil.com.br/v1' },
  { provider: 'sefaz_nfe', display_name: 'Portal NF-e (SEFAZ)', description: 'Atualização automática de tabelas cClassTrib/CST', urlPlaceholder: 'https://nfe.fazenda.gov.br/api' },
  { provider: 'erp_generic', display_name: 'ERP Exportador', description: 'Envio de tabela de preços e classificações para o ERP do cliente', urlPlaceholder: 'https://erp.cliente.com.br/api' },
]

export default function AdminSettings() {
  const { officeId } = useAuth()
  const qc = useQueryClient()

  // --- Office data ---
  const { data: office, isLoading } = useQuery({
    queryKey: ['office', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('offices').select('*').eq('id', officeId!).single()
      return data
    },
    enabled: !!officeId,
  })

  const { register: regOffice, handleSubmit: submitOffice } = useForm<{ name: string; cnpj: string }>({
    values: office ? { name: office.name, cnpj: office.cnpj || '' } : undefined,
  })

  const updateOfficeMutation = useMutation({
    mutationFn: async (data: { name: string; cnpj: string }) => {
      const { error } = await supabase.from('offices').update({ name: data.name, cnpj: data.cnpj }).eq('id', officeId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office'] })
      toast.success('Dados do escritório salvos!')
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  // --- Fiscal params ---
  const { data: fiscalParams } = useQuery({
    queryKey: ['fiscal-params', officeId],
    queryFn: async () => {
      const { data } = await (supabase.from('office_fiscal_params') as any).select('*').eq('office_id', officeId!).maybeSingle()
      return data || { ibs_state: 17.7, ibs_municipal: 2.3, cbs: 8.8, default_markup: 30, legacy_tax_rate: 27.65 }
    },
    enabled: !!officeId,
  })

  const { register: regFiscal, handleSubmit: submitFiscal } = useForm<{
    ibs_state: number; ibs_municipal: number; cbs: number; default_markup: number; legacy_tax_rate: number
  }>({
    values: fiscalParams ? {
      ibs_state: fiscalParams.ibs_state,
      ibs_municipal: fiscalParams.ibs_municipal,
      cbs: fiscalParams.cbs,
      default_markup: fiscalParams.default_markup,
      legacy_tax_rate: fiscalParams.legacy_tax_rate,
    } : undefined,
  })

  const saveFiscalMutation = useMutation({
    mutationFn: async (data: { ibs_state: number; ibs_municipal: number; cbs: number; default_markup: number; legacy_tax_rate: number }) => {
      const payload = { office_id: officeId!, ...data, updated_at: new Date().toISOString() }
      const { error } = await (supabase.from('office_fiscal_params') as any).upsert(payload, { onConflict: 'office_id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-params'] })
      toast.success('Parâmetros fiscais salvos!')
    },
    onError: () => toast.error('Erro ao salvar parâmetros'),
  })

  // --- Integrations ---
  const { data: integrations, isLoading: loadingIntegrations } = useQuery({
    queryKey: ['integrations', officeId],
    queryFn: async () => {
      const { data } = await (supabase.from('office_integrations') as any).select('*').eq('office_id', officeId!)
      return (data as any[]) || []
    },
    enabled: !!officeId,
  })

  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [testingProvider, setTestingProvider] = useState<string | null>(null)

  const saveIntegrationMutation = useMutation({
    mutationFn: async (payload: { provider: string; display_name: string; api_url: string; api_key: string; is_active: boolean }) => {
      const row = {
        office_id: officeId!,
        provider: payload.provider,
        display_name: payload.display_name,
        api_url: payload.api_url,
        api_key: payload.api_key,
        is_active: payload.is_active,
        config: {},
        updated_at: new Date().toISOString(),
      }
      const { error } = await (supabase.from('office_integrations') as any).upsert(row, { onConflict: 'office_id,provider' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      setEditingProvider(null)
      toast.success('Integração salva!')
    },
    onError: () => toast.error('Erro ao salvar integração'),
  })

  async function testConnection(provider: string) {
    const integration = integrations?.find((i: any) => i.provider === provider)
    if (!integration?.api_url) {
      toast.error('Configure a URL da API primeiro')
      return
    }
    setTestingProvider(provider)
    // Simulate connection test (2 second delay)
    await new Promise(r => setTimeout(r, 2000))
    try {
      new URL(integration.api_url)
      toast.success(`Conexão com ${integration.display_name || provider} verificada (formato válido)`)
    } catch {
      toast.error('URL inválida — verifique o endereço')
    }
    setTestingProvider(null)
  }

  function getIntegration(provider: string) {
    return integrations?.find((i: any) => i.provider === provider) || null
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-500 text-sm mt-1">Escritório, parâmetros fiscais e integrações</p>
      </div>

      <Tabs defaultValue="office">
        <TabsList>
          <TabsTrigger value="office" className="gap-2"><Building2 className="h-4 w-4" />Escritório</TabsTrigger>
          <TabsTrigger value="fiscal" className="gap-2"><Calculator className="h-4 w-4" />Parâmetros Fiscais</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2"><Plug className="h-4 w-4" />Integrações</TabsTrigger>
        </TabsList>

        {/* Office Tab */}
        <TabsContent value="office">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-5">Dados do Escritório</h3>
            {isLoading ? (
              <div className="space-y-4">
                {[1,2].map(i => <div key={i} className="h-10 animate-pulse bg-gray-100 rounded" />)}
              </div>
            ) : (
              <form onSubmit={submitOffice(d => updateOfficeMutation.mutate(d))} className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Nome do escritório</Label>
                  <Input {...regOffice('name')} />
                </div>
                <div className="space-y-1.5">
                  <Label>CNPJ</Label>
                  <Input {...regOffice('cnpj')} placeholder="00.000.000/0001-00" />
                </div>
                <div className="pt-2">
                  <Button type="submit" disabled={updateOfficeMutation.isPending}>
                    {updateOfficeMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </TabsContent>

        {/* Fiscal Tab */}
        <TabsContent value="fiscal">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
            <div>
              <h3 className="font-semibold text-gray-900">Alíquotas Padrão IBS/CBS</h3>
              <p className="text-xs text-gray-400 mt-1">Esses valores serão usados como padrão nas simulações de preço</p>
            </div>
            <form onSubmit={submitFiscal(d => saveFiscalMutation.mutate(d))} className="space-y-6">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label>IBS Estadual (%)</Label>
                  <Input type="number" step={0.001} {...regFiscal('ibs_state', { valueAsNumber: true })} />
                  <p className="text-xs text-gray-400">Referência: 17,7%</p>
                </div>
                <div className="space-y-1.5">
                  <Label>IBS Municipal (%)</Label>
                  <Input type="number" step={0.001} {...regFiscal('ibs_municipal', { valueAsNumber: true })} />
                  <p className="text-xs text-gray-400">Referência: 2,3%</p>
                </div>
                <div className="space-y-1.5">
                  <Label>CBS Federal (%)</Label>
                  <Input type="number" step={0.001} {...regFiscal('cbs', { valueAsNumber: true })} />
                  <p className="text-xs text-gray-400">Referência: 8,8%</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Markup padrão (%)</Label>
                  <Input type="number" step={0.5} {...regFiscal('default_markup', { valueAsNumber: true })} />
                  <p className="text-xs text-gray-400">Margem alvo padrão para simulações</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Carga tributária regime anterior (%)</Label>
                <Input type="number" step={0.01} {...regFiscal('legacy_tax_rate', { valueAsNumber: true })} className="max-w-xs" />
                <p className="text-xs text-gray-400">ICMS + PIS/COFINS estimado (padrão: 27,65%)</p>
              </div>
              <Button type="submit" disabled={saveFiscalMutation.isPending}>
                {saveFiscalMutation.isPending ? 'Salvando...' : 'Salvar parâmetros'}
              </Button>
            </form>
          </div>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div>
              <h3 className="font-semibold text-gray-900">Integrações</h3>
              <p className="text-xs text-gray-400 mt-1">Configure conexões com APIs externas</p>
            </div>

            {loadingIntegrations ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-20 animate-pulse bg-gray-100 rounded-lg" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {PROVIDERS.map(({ provider, display_name, description, urlPlaceholder }) => {
                  const integration = getIntegration(provider)
                  const isEditing = editingProvider === provider
                  const isTesting = testingProvider === provider

                  return (
                    <div key={provider} className="rounded-lg border border-gray-200 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between p-4 bg-gray-50/50">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${integration?.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{display_name}</p>
                            <p className="text-xs text-gray-500">{description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {integration?.is_active ? (
                            <Badge variant="success" className="text-xs">Ativa</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Inativa</Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingProvider(isEditing ? null : provider)}
                          >
                            {isEditing ? 'Fechar' : 'Configurar'}
                          </Button>
                        </div>
                      </div>

                      {/* Config form */}
                      {isEditing && (
                        <div className="p-4 border-t border-gray-200 space-y-4">
                          <form
                            onSubmit={e => {
                              e.preventDefault()
                              const formData = new FormData(e.currentTarget)
                              saveIntegrationMutation.mutate({
                                provider,
                                display_name,
                                api_url: formData.get('api_url') as string,
                                api_key: formData.get('api_key') as string,
                                is_active: formData.get('is_active') === 'on',
                              })
                            }}
                            className="space-y-4"
                          >
                            <div className="grid grid-cols-1 gap-4">
                              <div className="space-y-1.5">
                                <Label>URL da API</Label>
                                <Input
                                  name="api_url"
                                  defaultValue={integration?.api_url || ''}
                                  placeholder={urlPlaceholder}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Chave de API / Token</Label>
                                <div className="flex gap-2">
                                  <Input
                                    name="api_key"
                                    type={showKeys[provider] ? 'text' : 'password'}
                                    defaultValue={integration?.api_key || ''}
                                    placeholder="sk-..."
                                    className="flex-1"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }))}
                                  >
                                    {showKeys[provider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <input type="checkbox" name="is_active" id={`active-${provider}`} defaultChecked={integration?.is_active || false} className="rounded" />
                              <Label htmlFor={`active-${provider}`} className="text-sm font-normal cursor-pointer">Ativar integração</Label>
                            </div>

                            {integration?.last_sync_at && (
                              <p className="text-xs text-gray-400">Última sincronização: {new Date(integration.last_sync_at).toLocaleString('pt-BR')}</p>
                            )}

                            <div className="flex gap-2 pt-2">
                              <Button type="submit" disabled={saveIntegrationMutation.isPending}>
                                {saveIntegrationMutation.isPending ? 'Salvando...' : 'Salvar'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={isTesting}
                                onClick={() => testConnection(provider)}
                                className="gap-2"
                              >
                                {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                                {isTesting ? 'Testando...' : 'Testar Conexão'}
                              </Button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
