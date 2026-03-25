import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Shield, BarChart2, FileSearch, CheckCircle, ArrowRight,
  Building2, Tags, Calculator
} from 'lucide-react'

const features = [
  {
    icon: FileSearch,
    title: 'Diagnóstico NCM/NBS',
    description: 'Identifique automaticamente itens sem NCM, com código inválido ou vencido na tabela oficial.',
  },
  {
    icon: Tags,
    title: 'Classificação CST + cClassTrib',
    description: 'Wizard guiado para classificar cada item com base na LC 214/2025 e tabela cClassTrib oficial.',
  },
  {
    icon: Calculator,
    title: 'Simulador IBS/CBS',
    description: 'Calcule o impacto da reforma na precificação dos seus clientes com cenários antes/depois.',
  },
  {
    icon: Shield,
    title: 'Trilha de Auditoria',
    description: 'Rastreabilidade completa das decisões de classificação com justificativas e referências legais.',
  },
  {
    icon: Building2,
    title: 'Multi-empresa',
    description: 'Gerencie dezenas de empresas clientes em um único painel, com isolamento total de dados.',
  },
  {
    icon: BarChart2,
    title: 'Relatórios em PDF',
    description: 'Laudos profissionais com metodologia, classificações e projeção de carga tributária.',
  },
]

const stats = [
  { value: '27 estados', label: 'Cobertura IBS estadual' },
  { value: '5.570+', label: 'Municípios IBS municipal' },
  { value: 'LC 214/25', label: 'Base legal atualizada' },
  { value: '7 dias', label: 'Trial gratuito' },
]

export default function Index() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div>
            <span className="text-xl font-bold text-blue-600">TributoFlow</span>
            <span className="ml-2 text-xs text-gray-400">IBS/CBS</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link to="/cadastro/escritorio">
              <Button size="sm">Começar grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-20 pb-24 px-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6 text-blue-700 bg-blue-100 border-blue-200">
            Reforma Tributária — LC 214/2025
          </Badge>
          <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
            Classifique e precifique<br />
            <span className="text-blue-600">IBS e CBS</span> com segurança
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            Plataforma SaaS para escritórios contábeis classificarem NCM/NBS, aplicarem
            cClassTrib e simularem o impacto da reforma tributária nos preços dos seus clientes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/cadastro/escritorio">
              <Button size="lg" className="gap-2">
                Criar conta gratuita <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg">Já tenho conta</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-200 bg-gray-50 py-10">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-blue-600">{value}</p>
              <p className="text-sm text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">Tudo que seu escritório precisa</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
              Do diagnóstico de NCM à formação de preço com IBS/CBS — tudo em uma plataforma.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="border-gray-200 hover:border-blue-300 hover:shadow-md transition-all">
                <CardContent className="p-6">
                  <div className="p-2 bg-blue-50 rounded-lg w-fit mb-4">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pain points */}
      <section className="py-20 px-4 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">A reforma está chegando. Seus clientes estão preparados?</h2>
          <p className="text-gray-300 text-lg mb-10">
            Milhares de empresas ainda não têm NCM correto, desconhecem o cClassTrib e não sabem
            como a carga tributária vai mudar. O TributoFlow resolve isso.
          </p>
          <Link to="/cadastro/escritorio">
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-gray-900">
              Experimente grátis por 7 dias
            </Button>
          </Link>
        </div>
      </section>

      {/* Workflow */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-14">Como funciona</h2>
          <div className="space-y-8">
            {[
              { step: '1', title: 'Cadastre seu escritório', desc: 'Crie sua conta e adicione as empresas clientes que você atende.' },
              { step: '2', title: 'Importe os itens', desc: 'Faça upload de planilhas com produtos/serviços. O sistema valida NCM automaticamente.' },
              { step: '3', title: 'Classifique com o wizard', desc: 'O motor de classificação sugere CST e cClassTrib conforme a LC 214/2025.' },
              { step: '4', title: 'Simule e exporte', desc: 'Calcule o impacto nos preços e gere laudos em PDF para seus clientes.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-6 items-start">
                <div className="shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                  {step}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                  <p className="text-gray-500 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-blue-600 text-white">
        <div className="max-w-2xl mx-auto text-center">
          <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-80" />
          <h2 className="text-3xl font-bold mb-4">Pronto para começar?</h2>
          <p className="text-blue-100 mb-8">Crie sua conta e comece a classificar gratuitamente por 7 dias.</p>
          <Link to="/cadastro/escritorio">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50">
              Criar conta gratuita
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">© 2026 TributoFlow. Todos os direitos reservados.</p>
          <p className="text-sm text-gray-400">LC 214/2025 — IBS/CBS/IS</p>
        </div>
      </footer>
    </div>
  )
}
