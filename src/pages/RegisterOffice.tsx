import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const schema = z.object({
  full_name: z.string().min(3, 'Nome muito curto'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  office_name: z.string().min(3, 'Nome do escritório muito curto'),
  office_cnpj: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function RegisterOffice() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const { error } = await signUp(data.email, data.password, data.full_name)
      if (error) throw error

      // Wait briefly for auth to settle then call setup RPC
      await new Promise(r => setTimeout(r, 1000))

      const slug = data.office_name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')

      await supabase.rpc('setup_new_office', {
        name: data.office_name,
        slug,
        cnpj: data.office_cnpj || undefined,
      } as any)

      toast.success('Escritório criado com sucesso! Trial de 7 dias ativo.')
      navigate('/admin/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/">
            <span className="text-2xl font-bold text-blue-600">TributoFlow</span>
          </Link>
          <p className="text-gray-500 mt-2 text-sm">Cadastre seu escritório contábil</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <Label>Seu nome completo</Label>
              <Input placeholder="João Silva" {...register('full_name')} />
              {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="joao@escritorio.com.br" {...register('email')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input type="password" placeholder="Mínimo 8 caracteres" {...register('password')} />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <hr className="my-1 border-gray-200" />
            <div className="space-y-1.5">
              <Label>Nome do escritório</Label>
              <Input placeholder="Escritório Contábil ABC" {...register('office_name')} />
              {errors.office_name && <p className="text-xs text-red-500">{errors.office_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ do escritório <span className="text-gray-400">(opcional)</span></Label>
              <Input placeholder="00.000.000/0001-00" {...register('office_cnpj')} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta — 7 dias grátis'}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-gray-400">
            Ao criar, você concorda com nossos termos de uso e política de privacidade.
          </p>
          <div className="mt-4 text-center text-sm text-gray-500">
            Já tem conta?{' '}
            <Link to="/login" className="text-blue-600 hover:underline font-medium">Entrar</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
