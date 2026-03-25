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
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Building2, Search } from 'lucide-react'
import type { TaxRegime } from '@/integrations/supabase/types'

const schema = z.object({
  cnpj: z.string().min(14, 'CNPJ inválido'),
  legal_name: z.string().min(3, 'Nome muito curto'),
  trade_name: z.string().optional(),
  tax_regime: z.enum(['simples', 'lucro_presumido', 'lucro_real', 'mei']),
  main_cnae: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email('Email inválido').optional().or(z.literal('')),
})
type FormData = z.infer<typeof schema>

const regimeLabels: Record<TaxRegime, string> = {
  simples: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  mei: 'MEI',
}

export default function AdminClients() {
  const { officeId } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_companies')
        .select('*')
        .eq('office_id', officeId!)
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!officeId,
  })

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tax_regime: 'lucro_presumido' },
  })

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase.from('client_companies').insert({
        ...data,
        office_id: officeId!,
        sector_flags: {},
        trade_name: data.trade_name || null,
        main_cnae: data.main_cnae || null,
        contact_name: data.contact_name || null,
        contact_email: data.contact_email || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies', officeId] })
      toast.success('Empresa cadastrada com sucesso!')
      setOpen(false)
      reset()
    },
    onError: () => toast.error('Erro ao cadastrar empresa'),
  })

  const filtered = (companies || []).filter(c =>
    c.legal_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.trade_name || '').toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj.includes(search)
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">{companies?.length || 0} empresas cadastradas</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova empresa
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por nome ou CNPJ..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-gray-100 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Nenhuma empresa encontrada.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpen(true)}>
              Cadastrar primeira empresa
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Empresa</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">CNPJ</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Regime</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">CNAE</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Contato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-900">{c.trade_name || c.legal_name}</p>
                    {c.trade_name && <p className="text-xs text-gray-400">{c.legal_name}</p>}
                  </td>
                  <td className="py-3 px-4 font-mono text-gray-600 text-xs">{c.cnpj}</td>
                  <td className="py-3 px-4">
                    <Badge variant="secondary" className="text-xs">{regimeLabels[c.tax_regime as TaxRegime]}</Badge>
                  </td>
                  <td className="py-3 px-4 text-gray-500">{c.main_cnae || '—'}</td>
                  <td className="py-3 px-4 text-gray-500">{c.contact_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Empresa Cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Razão Social *</Label>
                <Input {...register('legal_name')} placeholder="Empresa XYZ LTDA" />
                {errors.legal_name && <p className="text-xs text-red-500">{errors.legal_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Nome Fantasia</Label>
                <Input {...register('trade_name')} placeholder="XYZ" />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ *</Label>
                <Input {...register('cnpj')} placeholder="00.000.000/0001-00" />
                {errors.cnpj && <p className="text-xs text-red-500">{errors.cnpj.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Regime Tributário *</Label>
                <Select onValueChange={v => setValue('tax_regime', v as TaxRegime)} defaultValue="lucro_presumido">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(regimeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>CNAE Principal</Label>
                <Input {...register('main_cnae')} placeholder="4711-3/01" />
              </div>
              <div className="space-y-1.5">
                <Label>Contato</Label>
                <Input {...register('contact_name')} placeholder="Maria Silva" />
              </div>
              <div className="space-y-1.5">
                <Label>Email do Contato</Label>
                <Input type="email" {...register('contact_email')} placeholder="maria@empresa.com" />
                {errors.contact_email && <p className="text-xs text-red-500">{errors.contact_email.message}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Salvando...' : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
