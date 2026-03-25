import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Building2, Calculator, Plug } from 'lucide-react'

export default function AdminSettings() {
  const { officeId } = useAuth()
  const qc = useQueryClient()

  const { data: office, isLoading } = useQuery({
    queryKey: ['office', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('offices').select('*').eq('id', officeId!).single()
      return data
    },
    enabled: !!officeId,
  })

  const { register, handleSubmit } = useForm<{ name: string; cnpj: string }>({
    values: office ? { name: office.name, cnpj: office.cnpj || '' } : undefined,
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; cnpj: string }) => {
      const { error } = await supabase.from('offices').update({ name: data.name, cnpj: data.cnpj }).eq('id', officeId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office'] })
      toast.success('Configurações salvas!')
    },
    onError: () => toast.error('Erro ao salvar'),
  })

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
              <form onSubmit={handleSubmit(d => updateMutation.mutate(d))} className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Nome do escritório</Label>
                  <Input {...register('name')} />
                </div>
                <div className="space-y-1.5">
                  <Label>CNPJ</Label>
                  <Input {...register('cnpj')} placeholder="00.000.000/0001-00" />
                </div>
                <div className="pt-2">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </TabsContent>

        {/* Fiscal Tab */}
        <TabsContent value="fiscal">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
            <h3 className="font-semibold text-gray-900">Alíquotas Padrão IBS/CBS</h3>
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label>IBS Estadual (%)</Label>
                <Input type="number" defaultValue={17.7} step={0.01} />
                <p className="text-xs text-gray-400">Alíquota de referência — ajustável por estado</p>
              </div>
              <div className="space-y-1.5">
                <Label>IBS Municipal (%)</Label>
                <Input type="number" defaultValue={2.3} step={0.01} />
                <p className="text-xs text-gray-400">Alíquota de referência — ajustável por município</p>
              </div>
              <div className="space-y-1.5">
                <Label>CBS Federal (%)</Label>
                <Input type="number" defaultValue={8.8} step={0.01} />
                <p className="text-xs text-gray-400">Contribuição sobre Bens e Serviços</p>
              </div>
              <div className="space-y-1.5">
                <Label>Markup padrão (%)</Label>
                <Input type="number" defaultValue={30} step={0.5} />
                <p className="text-xs text-gray-400">Margem alvo padrão para simulações</p>
              </div>
            </div>
            <Button onClick={() => toast.success('Parâmetros salvos!')}>Salvar parâmetros</Button>
          </div>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
            <h3 className="font-semibold text-gray-900">Integrações</h3>
            <div className="space-y-4">
              {[
                { name: 'API Conformidade Fácil', desc: 'Validação NCM em tempo real', status: 'Pendente' },
                { name: 'Portal NF-e (SEFAZ)', desc: 'Atualização automática de tabelas cClassTrib', status: 'Pendente' },
                { name: 'ERP Exportador', desc: 'Envio de tabela de preços para ERP do cliente', status: 'Em estudo' },
              ].map(({ name, desc, status }) => (
                <div key={name} className="flex items-center justify-between p-4 rounded-lg border border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">{name}</p>
                    <p className="text-sm text-gray-500">{desc}</p>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{status}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
