import React, { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { classifyNcmWithAI, suggestNcm, type NcmSuggestion, type NcmConfidence } from '@/lib/ncm-suggestion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Upload, FileSpreadsheet, CheckCircle, AlertTriangle, XCircle,
  Loader2, Search, ChevronDown, ChevronUp, Download, RotateCcw, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────
interface XlsxRow {
  description: string
  price?: number
  unit?: string
  rawRow: Record<string, unknown>
}

interface ImportRow {
  id: string
  description: string
  price?: number
  unit?: string
  // NCM
  ncmCode: string
  ncmDescription: string
  confidence: NcmConfidence
  allOptions: NcmSuggestion[]
  reasoning: string
  usedAI: boolean
  fromCache: boolean
  // State
  status: 'pending' | 'processing' | 'done' | 'error'
  included: boolean
  searchOpen: boolean
  searchQuery: string
  searchResults: NcmSuggestion[]
  searchLoading: boolean
}

// ── Helpers ───────────────────────────────────────────────────────
const CONFIDENCE_META: Record<NcmConfidence, { label: string; color: string; icon: typeof CheckCircle }> = {
  high:   { label: 'Alta',   color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  medium: { label: 'Média',  color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: AlertTriangle },
  low:    { label: 'Baixa',  color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertTriangle },
  none:   { label: 'Nenhum', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
}

function detectDescriptionColumn(headers: string[]): string | null {
  const candidates = ['descricao', 'descrição', 'description', 'produto', 'item', 'nome', 'name', 'mercadoria', 'servico', 'serviço']
  const lower = headers.map(h => ({ h, l: h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }))
  for (const cand of candidates) {
    const found = lower.find(({ l }) => l.includes(cand))
    if (found) return found.h
  }
  return headers[0] || null
}

function detectPriceColumn(headers: string[]): string | null {
  const candidates = ['preco', 'preço', 'price', 'valor', 'value', 'custo', 'cost', 'venda']
  const lower = headers.map(h => ({ h, l: h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }))
  for (const cand of candidates) {
    const found = lower.find(({ l }) => l.includes(cand))
    if (found) return found.h
  }
  return null
}

// Process in parallel batches
async function processBatch<T, R>(items: T[], fn: (item: T) => Promise<R>, batchSize = 5): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

// ── Main Component ────────────────────────────────────────────────
export default function AdminNcmImport() {
  const { officeId, user } = useAuth()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [companyId, setCompanyId] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState<'upload' | 'mapping' | 'results'>('upload')
  const [xlsxHeaders, setXlsxHeaders] = useState<string[]>([])
  const [xlsxRaw, setXlsxRaw] = useState<Record<string, unknown>[]>([])
  const [descCol, setDescCol] = useState('')
  const [priceCol, setPriceCol] = useState('__none__')

  const { data: companies } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase.from('client_companies').select('id, legal_name, trade_name').eq('office_id', officeId!) as any
      return (data as any[]) || []
    },
    enabled: !!officeId,
  })

  // ── File parsing ──────────────────────────────────────────────
  function parseFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Arquivo inválido. Use .xlsx, .xls ou .csv')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const jsonData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws)

        if (jsonData.length === 0) return toast.error('Planilha vazia')

        const headers = Object.keys(jsonData[0])
        setXlsxHeaders(headers)
        setXlsxRaw(jsonData)

        const detectedDesc = detectDescriptionColumn(headers)
        const detectedPrice = detectPriceColumn(headers)
        setDescCol(detectedDesc || '')
        setPriceCol(detectedPrice || '__none__')
        setStep('mapping')
        toast.success(`${jsonData.length} linhas detectadas`)
      } catch {
        toast.error('Erro ao ler arquivo. Verifique o formato.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  // ── Process: run NCM suggestion for all rows ──────────────────
  async function handleProcess() {
    if (!descCol) return toast.error('Selecione a coluna de descrição')
    if (!companyId) return toast.error('Selecione a empresa')

    const initialRows: ImportRow[] = xlsxRaw.map((raw, idx) => ({
      id: `row-${idx}`,
      description: String(raw[descCol] || '').trim(),
      price: (priceCol && priceCol !== '__none__') ? parseFloat(String(raw[priceCol] || '0')) || undefined : undefined,
      reasoning: '',
      usedAI: false,
      fromCache: false,
      unit: undefined,
      ncmCode: '',
      ncmDescription: '',
      confidence: 'none' as NcmConfidence,
      allOptions: [],
      status: 'pending' as const,
      included: true,
      searchOpen: false,
      searchQuery: '',
      searchResults: [],
      searchLoading: false,
    })).filter(r => r.description.length > 2)

    setRows(initialRows)
    setStep('results')
    setProcessing(true)
    setProgress(0)

    let done = 0

    try {
      await processBatch(
        initialRows,
        async (row) => {
          try {
            const match = await classifyNcmWithAI(row.description)
            const safeConfidence: NcmConfidence =
              (match.confidence && match.confidence in CONFIDENCE_META)
                ? match.confidence
                : 'none'
            setRows(prev => prev.map(r => r.id !== row.id ? r : {
              ...r,
              ncmCode: match.suggestion?.code || '',
              ncmDescription: match.suggestion?.description || '',
              confidence: safeConfidence,
              allOptions: match.allSuggestions ?? [],
              reasoning: match.reasoning || '',
              usedAI: match.usedAI ?? false,
              fromCache: match.fromCache ?? false,
              status: 'done' as const,
            }))
          } catch {
            setRows(prev => prev.map(r => r.id !== row.id ? r : {
              ...r,
              confidence: 'none' as NcmConfidence,
              status: 'error' as const,
              reasoning: 'Erro ao classificar este item.',
            }))
          }
          done++
          setProgress(Math.round((done / initialRows.length) * 100))
        },
        6,
      )
      toast.success('Classificação concluída!')
    } catch (err: any) {
      toast.error('Erro durante classificação: ' + (err?.message || 'tente novamente'))
    } finally {
      setProcessing(false)
    }
  }

  // ── Inline NCM search ─────────────────────────────────────────
  const handleSearch = useCallback(async (rowId: string, query: string) => {
    setRows(prev => prev.map(r => r.id !== rowId ? r : { ...r, searchQuery: query, searchLoading: true }))
    try {
      const results = await suggestNcm(query, 8)
      setRows(prev => prev.map(r => r.id !== rowId ? r : { ...r, searchResults: results, searchLoading: false }))
    } catch {
      setRows(prev => prev.map(r => r.id !== rowId ? r : { ...r, searchLoading: false }))
    }
  }, [])

  function selectNcm(rowId: string, suggestion: NcmSuggestion) {
    setRows(prev => prev.map(r => r.id !== rowId ? r : {
      ...r,
      ncmCode: suggestion.code,
      ncmDescription: suggestion.description,
      confidence: 'high',
      searchOpen: false,
      searchQuery: '',
      searchResults: [],
    }))
  }

  function toggleIncluded(rowId: string) {
    setRows(prev => prev.map(r => r.id !== rowId ? r : { ...r, included: !r.included }))
  }

  function toggleSearch(rowId: string) {
    setRows(prev => prev.map(r => r.id !== rowId ? r : {
      ...r,
      searchOpen: !r.searchOpen,
      searchQuery: r.searchOpen ? '' : r.description,
      searchResults: r.searchOpen ? [] : r.allOptions,
    }))
  }

  // ── Import to DB ──────────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: async () => {
      const toImport = rows.filter(r => r.included && r.ncmCode)
      if (toImport.length === 0) throw new Error('Nenhum item com NCM para importar')

      const records = toImport.map(r => ({
        office_id: officeId!,
        company_id: companyId,
        description: r.description,
        ncm_current: r.ncmCode,
        base_cost: r.price || null,
        status: 'pending',
        created_by: user!.id,
      }))

      const CHUNK = 100
      for (let i = 0; i < records.length; i += CHUNK) {
        const { error } = await (supabase.from('items') as any).insert(records.slice(i, i + CHUNK))
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      toast.success(`${rows.filter(r => r.included && r.ncmCode).length} itens importados com sucesso!`)
      setStep('upload')
      setRows([])
      setXlsxRaw([])
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao importar'),
  })

  // ── Export template ───────────────────────────────────────────
  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { Descricao: 'Arroz branco polido tipo 1', Preco: 5.90 },
      { Descricao: 'Notebook Dell 15 i7', Preco: 3500.00 },
      { Descricao: 'Servico de consultoria em TI', Preco: 200.00 },
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos')
    XLSX.writeFile(wb, 'modelo-importacao-tributoflow.xlsx')
  }

  // ── Stats ─────────────────────────────────────────────────────
  const stats = {
    total: rows.filter(r => r.included).length,
    high: rows.filter(r => r.included && r.confidence === 'high').length,
    medium: rows.filter(r => r.included && r.confidence === 'medium').length,
    low: rows.filter(r => r.included && (r.confidence === 'low' || r.confidence === 'none')).length,
    noNcm: rows.filter(r => r.included && !r.ncmCode).length,
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Importar Produtos via Planilha
            <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              <Sparkles className="h-3 w-3" /> IA
            </span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">NCM classificado automaticamente por Claude Haiku — com raciocínio explicado</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
          <Download className="h-4 w-4" /> Baixar Modelo
        </Button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(['upload', 'mapping', 'results'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
              step === s ? 'bg-blue-600 text-white' :
              ((['upload', 'mapping', 'results'].indexOf(step) > i) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500')
            )}>{i + 1}</div>
            <span className={cn('text-sm', step === s ? 'font-semibold text-gray-900' : 'text-gray-500')}>
              {['Upload', 'Colunas', 'Revisão'][i]}
            </span>
            {i < 2 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          className={cn(
            'border-2 border-dashed rounded-xl p-16 text-center transition-colors',
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          )}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-700">Arraste a planilha aqui</p>
          <p className="text-sm text-gray-500 mt-1 mb-6">Suporta .xlsx, .xls e .csv</p>
          <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" /> Selecionar Arquivo
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {/* Step 2: Column mapping */}
      {step === 'mapping' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
          <h2 className="font-semibold text-gray-900">Mapeamento de Colunas</h2>
          <p className="text-sm text-gray-500">
            Planilha com <strong>{xlsxRaw.length} linhas</strong> e {xlsxHeaders.length} colunas.
            Confirme o mapeamento abaixo.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Empresa *</label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar empresa..." />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Coluna: Descrição *</label>
              <Select value={descCol} onValueChange={setDescCol}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar coluna..." />
                </SelectTrigger>
                <SelectContent>
                  {xlsxHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Coluna: Preço (opcional)</label>
              <Select value={priceCol} onValueChange={setPriceCol}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem preço" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem preço</SelectItem>
                  {xlsxHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          {descCol && (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                Prévia (primeiras 5 linhas)
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {xlsxRaw.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-gray-600">{String(row[descCol] || '')}</td>
                      {priceCol && <td className="px-4 py-2 text-gray-400 text-right font-mono">{String(row[priceCol] || '')}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
            <Button
              onClick={handleProcess}
              disabled={!descCol || !companyId}
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              Classificar {xlsxRaw.length} produtos automaticamente
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 'results' && (
        <div className="space-y-4">
          {/* Progress */}
          {processing && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Classificando produtos…</span>
                <span className="text-sm text-gray-500">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats */}
          {!processing && rows.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total incluídos', value: stats.total, color: 'text-gray-900' },
                { label: 'Alta confiança', value: stats.high, color: 'text-green-600' },
                { label: 'Média confiança', value: stats.medium, color: 'text-yellow-600' },
                { label: 'Baixa / sem NCM', value: stats.low, color: 'text-red-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-4 text-center shadow-sm">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="py-3 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={rows.every(r => r.included)}
                        onChange={e => setRows(prev => prev.map(r => ({ ...r, included: e.target.checked })))}
                        className="rounded"
                      />
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Descrição</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-36">NCM Sugerido</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Descrição NCM + Raciocínio</th>
                    <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 uppercase w-28">Confiança</th>
                    <th className="py-3 px-3 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(row => {
                    const meta = CONFIDENCE_META[row.confidence] ?? CONFIDENCE_META.none
                    const ConfIcon = meta.icon
                    return (
                      <React.Fragment key={row.id}>
                        <tr className={cn('hover:bg-gray-50', !row.included && 'opacity-40')}>
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={row.included}
                              onChange={() => toggleIncluded(row.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="text-gray-900 font-medium">{row.description}</p>
                            {row.price && <p className="text-xs text-gray-400 font-mono">R$ {row.price.toFixed(2)}</p>}
                          </td>
                          <td className="py-2.5 px-3">
                            {row.status === 'processing' || (processing && row.status === 'pending') ? (
                              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                            ) : (
                              <code className={cn(
                                'text-xs font-mono font-bold px-2 py-0.5 rounded',
                                row.ncmCode ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                              )}>
                                {row.ncmCode || '—'}
                              </code>
                            )}
                          </td>
                          <td className="py-2.5 px-3 max-w-sm">
                            <p className="text-xs text-gray-700 font-medium truncate">{row.ncmDescription || '—'}</p>
                            {row.reasoning && (
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 italic">
                                {row.usedAI && <span className="text-blue-500 not-italic font-medium mr-1">✦IA:</span>}
                                {row.reasoning}
                                {row.fromCache && <span className="text-gray-300 ml-1">(cache)</span>}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {row.status === 'done' && (
                              <div className="flex flex-col items-center gap-1">
                                <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium', meta.color)}>
                                  <ConfIcon className="h-3 w-3" />
                                  {meta.label}
                                </span>
                                {row.usedAI && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 font-medium">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    IA
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleSearch(row.id)}
                              className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                              title="Alterar NCM"
                            >
                              {row.searchOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                            </Button>
                          </td>
                        </tr>

                        {/* Inline search row */}
                        {row.searchOpen && (
                          <tr key={`${row.id}-search`} className="bg-blue-50 border-l-2 border-l-blue-500">
                            <td />
                            <td colSpan={5} className="py-3 px-3">
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <Input
                                    autoFocus
                                    value={row.searchQuery}
                                    onChange={e => handleSearch(row.id, e.target.value)}
                                    placeholder="Buscar por descrição do NCM..."
                                    className="h-8 text-xs"
                                  />
                                  {row.searchLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400 my-auto" />}
                                </div>
                                {(row.searchResults.length > 0 || row.allOptions.length > 0) && (
                                  <div className="grid gap-1 max-h-48 overflow-y-auto">
                                    {(row.searchResults.length > 0 ? row.searchResults : row.allOptions).map(s => (
                                      <button
                                        key={s.code}
                                        onClick={() => selectNcm(row.id, s)}
                                        className="flex items-center gap-3 p-2 rounded-md bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-left transition-colors"
                                      >
                                        <code className="text-xs font-mono font-bold text-blue-700 shrink-0">{s.code}</code>
                                        <span className="text-xs text-gray-600 line-clamp-1">{s.description}</span>
                                        {s.score >= 20 && <Badge variant="success" className="text-[10px] px-1.5 shrink-0">Alta</Badge>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer actions */}
            {!processing && rows.length > 0 && (
              <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setStep('upload'); setRows([]); setXlsxRaw([]) }}
                    className="gap-1"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Novo Import
                  </Button>
                  {stats.noNcm > 0 && (
                    <span className="text-xs text-red-600">
                      {stats.noNcm} itens sem NCM serão ignorados
                    </span>
                  )}
                </div>
                <Button
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending || stats.total === 0}
                  className="gap-2"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Importar {stats.total - stats.noNcm} itens
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

