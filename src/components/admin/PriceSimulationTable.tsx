import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  calculateTax,
  calculateBatch,
  compareCurrentVsNew,
  TRANSITION_SCHEDULE,
  formatBRL,
  formatPercent,
  type BatchItem,
  type ComparisonInput,
  type CstReductionFactors,
} from '@/lib/tax-engine'
import { TaxImpactChart } from './TaxImpactChart'
import { ArrowDown, ArrowUp, Minus, Plus, Trash2, Calculator, TrendingUp } from 'lucide-react'

interface SimulationRow {
  id: string
  description: string
  price: string
  currentRate: string
  pRedIBS: string
  pRedCBS: string
}

let rowIdCounter = 0
function newRow(): SimulationRow {
  return {
    id: `row-${++rowIdCounter}`,
    description: '',
    price: '',
    currentRate: '',
    pRedIBS: '0',
    pRedCBS: '0',
  }
}

export function PriceSimulationTable() {
  const [rows, setRows] = useState<SimulationRow[]>([newRow()])
  const [year, setYear] = useState('2033')
  const [showChart, setShowChart] = useState(false)

  function addRow() {
    setRows(prev => [...prev, newRow()])
  }

  function removeRow(id: string) {
    setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev)
  }

  function updateRow(id: string, field: keyof SimulationRow, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  // Parse rows into valid items
  const validItems = useMemo(() => {
    return rows
      .filter(r => r.description && r.price && parseFloat(r.price) > 0)
      .map(r => ({
        id: r.id,
        description: r.description,
        price: parseFloat(r.price),
        currentRate: parseFloat(r.currentRate || '0') / 100,
        reductions: {
          pRedIBS: parseFloat(r.pRedIBS || '0'),
          pRedCBS: parseFloat(r.pRedCBS || '0'),
        } as CstReductionFactors,
      }))
  }, [rows])

  // Calculate results
  const results = useMemo(() => {
    if (validItems.length === 0) return null

    const batchItems: BatchItem[] = validItems.map(v => ({
      id: v.id,
      description: v.description,
      price: v.price,
      reductions: v.reductions,
    }))

    const batchResult = calculateBatch(batchItems, parseInt(year))

    const comparisonInput: ComparisonInput[] = validItems.map(v => ({
      description: v.description,
      price: v.price,
      currentTaxRate: v.currentRate,
      reductions: v.reductions,
    }))

    const comparison = compareCurrentVsNew(comparisonInput, parseInt(year))

    return { batch: batchResult, comparison }
  }, [validItems, year])

  // Chart data
  const chartData = useMemo(() => {
    if (!results) return []
    return results.comparison.map(c => ({
      name: c.description.length > 20 ? c.description.slice(0, 20) + '…' : c.description,
      antes: c.currentRate * 100,
      depois: c.newRate * 100,
    }))
  }, [results])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            Simulação de Impacto Tributário
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Compare a carga atual vs. IBS/CBS por ano de transição
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Label className="text-xs text-gray-500">Ano:</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSITION_SCHEDULE.map(t => (
                <SelectItem key={t.year} value={String(t.year)}>
                  {t.year} — {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Input table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-1/4">Descrição</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-28">Preço (R$)</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-28">Carga Atual (%)</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-24">Red. IBS (%)</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-24">Red. CBS (%)</th>
                <th className="py-3 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.id}>
                  <td className="py-2 px-3">
                    <Input
                      value={row.description}
                      onChange={e => updateRow(row.id, 'description', e.target.value)}
                      placeholder="Ex: Smartphone Samsung"
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <Input
                      type="number"
                      value={row.price}
                      onChange={e => updateRow(row.id, 'price', e.target.value)}
                      placeholder="1000.00"
                      className="h-8 text-xs font-mono"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <Input
                      type="number"
                      value={row.currentRate}
                      onChange={e => updateRow(row.id, 'currentRate', e.target.value)}
                      placeholder="34.5"
                      className="h-8 text-xs font-mono"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <Input
                      type="number"
                      value={row.pRedIBS}
                      onChange={e => updateRow(row.id, 'pRedIBS', e.target.value)}
                      placeholder="0"
                      className="h-8 text-xs font-mono"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <Input
                      type="number"
                      value={row.pRedCBS}
                      onChange={e => updateRow(row.id, 'pRedCBS', e.target.value)}
                      placeholder="0"
                      className="h-8 text-xs font-mono"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(row.id)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-gray-200 flex gap-2">
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1 text-xs">
            <Plus className="h-3 w-3" /> Adicionar Item
          </Button>
          {results && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChart(!showChart)}
              className="gap-1 text-xs ml-auto"
            >
              <TrendingUp className="h-3 w-3" />
              {showChart ? 'Ocultar Gráfico' : 'Ver Gráfico'}
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {results && (
        <>
          {/* Comparison table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">
                Resultado — Ano {year} ({TRANSITION_SCHEDULE.find(t => t.year === parseInt(year))?.label})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Preço</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Imposto Atual</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">IBS/CBS</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Diferença</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase">Impacto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.comparison.map((comp, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-900">{comp.description}</td>
                      <td className="py-3 px-4 text-right font-mono text-gray-600">{formatBRL(comp.price)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-gray-600">{formatBRL(comp.currentTax)}</span>
                        <span className="text-xs text-gray-400 ml-1">({formatPercent(comp.currentRate)})</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-gray-600">{formatBRL(comp.newTax)}</span>
                        <span className="text-xs text-gray-400 ml-1">({formatPercent(comp.newRate)})</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        <span className={comp.impact === 'increase' ? 'text-red-600' : comp.impact === 'decrease' ? 'text-green-600' : 'text-gray-500'}>
                          {comp.difference > 0 ? '+' : ''}{formatBRL(comp.difference)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {comp.impact === 'increase' ? (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <ArrowUp className="h-3 w-3" />
                            +{comp.differencePercent}%
                          </Badge>
                        ) : comp.impact === 'decrease' ? (
                          <Badge variant="success" className="gap-1 text-xs">
                            <ArrowDown className="h-3 w-3" />
                            {comp.differencePercent}%
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Minus className="h-3 w-3" />
                            Neutro
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals */}
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="py-3 px-4 text-gray-900">Totais</td>
                    <td className="py-3 px-4 text-right font-mono">{formatBRL(results.batch.totals.grossTotal)}</td>
                    <td className="py-3 px-4 text-right font-mono text-gray-600">
                      {formatBRL(results.comparison.reduce((s, c) => s + c.currentTax, 0))}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-600">
                      {formatBRL(results.batch.totals.taxTotal)}
                      <span className="text-xs text-gray-400 ml-1">({formatPercent(results.batch.totals.avgBurden)})</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatBRL(results.batch.totals.taxTotal - results.comparison.reduce((s, c) => s + c.currentTax, 0))}
                    </td>
                    <td className="py-3 px-4"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* CBS/IBS breakdown */}
            <div className="p-4 border-t border-gray-200 bg-blue-50/50">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500">CBS (Federal)</p>
                  <p className="text-lg font-bold text-blue-700">{formatBRL(results.batch.totals.cbsTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">IBS (Est. + Mun.)</p>
                  <p className="text-lg font-bold text-indigo-700">{formatBRL(results.batch.totals.ibsTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total IVA Dual</p>
                  <p className="text-lg font-bold text-gray-900">{formatBRL(results.batch.totals.taxTotal)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Chart */}
          {showChart && chartData.length > 0 && (
            <TaxImpactChart data={chartData} title="Comparativo: Carga Atual vs IBS/CBS" />
          )}
        </>
      )}
    </div>
  )
}
