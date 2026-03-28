import React, { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
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
type NcmConfidence = 'high' | 'medium' | 'low' | 'none'

interface ImportRow {
  id: string
  description: string
  ncmCode: string      // vem da planilha
  price?: number
  // cClassTrib resultado
  cClassTrib: string
  cClassTribDesc: string
  cst: string
  regime: string
  pRedIbs: number
  pRedCbs: number
  confidence: NcmConfidence
  reasoning: string
  usedAI: boolean
  fromCache: boolean
  // estado
  status: 'pending' | 'processing' | 'done' | 'error'
  included: boolean
}

// ── Helpers ───────────────────────────────────────────────────────
const CONFIDENCE_META: Record<NcmConfidence, { label: string; color: string; icon: typeof CheckCircle }> = {
  high:   { label: 'Alta',   color: 'bg-green-100 text-green-700 border-green-200',   icon: CheckCircle },
  medium: { label: 'Média',  color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: AlertTriangle },
  low:    { label: 'Baixa',  color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertTriangle },
  none:   { label: 'Nenhum', color: 'bg-red-100 text-red-700 border-red-200',          icon: XCircle },
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

function detectNcmColumn(headers: string[]): string | null {
  const candidates = ['ncm', 'codigo ncm', 'cod ncm', 'ncm_code', 'ncmcode', 'codigoncm', 'cod_ncm']
  const lower = headers.map(h => ({ h, l: h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '') }))
  for (const cand of candidates) {
    const found = lower.find(({ l }) => l.includes(cand.replace(/\s+/g, '')))
    if (found) return found.h
  }
  return null
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
async function processBatch<T, R>(items: T[], fn: (item: T) => Promise<R>, batchSize = 6): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

// Normalize NCM code to 8 digits (remove dots, spaces, pad)
function normalizeNcm(raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw).replace(/[\.\s\-]/g, '').trim()
  // If it's numeric-ish and shorter than 8 digits, left-pad with zeros
  if (/^\d+$/.test(s) && s.length < 8) return s.padStart(8, '0')
  return s
}

// ── Classification function (calls Edge Function) ─────────────────
async function classifyCClassTrib(
  description: string,
  ncmCode: string,
): Promise<{
  cClassTrib: string
  cClassTribDesc: string
  cst: string
  regime: string
  pRedIbs: number
  pRedCbs: number
  confidence: NcmConfidence
  reasoning: string
  usedAI: boolean
  fromCache: boolean
}> {
  // 1. Busca candidatos na tax_cclasstrib (todos os registros ativos — lista pequena ~154)
  const { data: allCClassTribs } = await supabase
    .from('tax_cclasstrib')
    .select('code, description, regime_type, p_red_ibs, p_red_cbs')
    .is('end_date', null)
    .order('code')

  const candidates = (allCClassTribs || []).map(c => ({
    code: c.code,
    description: c.description,
    cst: (c.code as string).substring(0, 3),
    regime: c.regime_type,
    p_red_ibs: c.p_red_ibs,
    p_red_cbs: c.p_red_cbs,
  }))

  // Call Edge Function directly via fetch (bypasses supabase.functions.invoke
  // which sends the user's session JWT — the gateway rejects it for Edge Functions).
  const EDGE_URL = 'https://egwnftrxaaouvtsbcssf.supabase.co/functions/v1/classify-cclasstrib'
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnd25mdHJ4YWFvdXZ0c2Jjc3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTY4MTAsImV4cCI6MjA4OTk3MjgxMH0.RATvNbBSsIY6cbi6Rd86NDjUcCad5HjSccGNw8-3NH4'

  try {
    const response = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description, ncmCode, candidates }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`HTTP ${response.status}: ${errBody}`)
    }

    const data = await response.json()
    if (!data?.code) throw new Error(`Empty response: ${JSON.stringify(data)}`)

    return {
      cClassTrib: data.code,
      cClassTribDesc: data.description || '',
      cst: data.cstCode || (data.code as string).substring(0, 3),
      regime: data.regime || '',
      pRedIbs: data.pRedIbs || 0,
      pRedCbs: data.pRedCbs || 0,
      confidence: (data.confidence as NcmConfidence) || 'none',
      reasoning: data.reasoning || '',
      usedAI: true,
      fromCache: data.fromCache || false,
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[classify-cclasstrib]', errMsg)
    const fallback = candidates.find(c => c.code === '000001') || candidates[0]
    return {
      cClassTrib: fallback?.code || '',
      cClassTribDesc: fallback?.description || '',
      cst: fallback?.cst || '',
      regime: fallback?.regime || '',
      pRedIbs: fallback?.p_red_ibs || 0,
      pRedCbs: fallback?.p_red_cbs || 0,
      confidence: 'low',
      reasoning: `Erro: ${errMsg}`,
      usedAI: false,
      fromCache: false,
    }
  }
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
  const [ncmCol, setNcmCol] = useState('')
  const [priceCol, setPriceCol] = useState('__none__')

  const { data: companies } = useQuery({
    queryKey: ['companies', officeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_companies')
        .select('id, legal_name, trade_name')
        .eq('office_id', officeId!) as any
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
        const detectedNcm = detectNcmColumn(headers)
        const detectedPrice = detectPriceColumn(headers)
        setDescCol(detectedDesc || '')
        setNcmCol(detectedNcm || '')
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

  // ── Process: classify cClassTrib for all rows ─────────────────
  async function handleProcess() {
    if (!descCol) return toast.error('Selecione a coluna de descrição')
    if (!ncmCol) return toast.error('Selecione a coluna de NCM')
    if (!companyId) return toast.error('Selecione a empresa')

    const initialRows: ImportRow[] = xlsxRaw.map((raw, idx) => ({
      id: `row-${idx}`,
      description: String(raw[descCol] || '').trim(),
      ncmCode: normalizeNcm(raw[ncmCol]),
      price: (priceCol && priceCol !== '__none__')
        ? parseFloat(String(raw[priceCol] || '0')) || undefined
        : undefined,
      cClassTrib: '',
      cClassTribDesc: '',
      cst: '',
      regime: '',
      pRedIbs: 0,
      pRedCbs: 0,
      confidence: 'none' as NcmConfidence,
      reasoning: '',
      usedAI: false,
      fromCache: false,
      status: 'pending' as const,
      included: true,
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
            const result = await classifyCClassTrib(row.description, row.ncmCode)
            setRows(prev => prev.map(r => r.id !== row.id ? r : {
              ...r,
              cClassTrib: result.cClassTrib,
              cClassTribDesc: result.cClassTribDesc,
              cst: result.cst,
              regime: result.regime,
              pRedIbs: result.pRedIbs,
              pRedCbs: result.pRedCbs,
              confidence: result.confidence,
              reasoning: result.reasoning,
              usedAI: result.usedAI,
              fromCache: result.fromCache,
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
      toast.success('Classificação cClassTrib concluída!')
    } catch (err: any) {
      toast.error('Erro durante classificação: ' + (err?.message || 'tente novamente'))
    } finally {
      setProcessing(false)
    }
  }

  function toggleIncluded(rowId: string) {
    setRows(prev => prev.map(r => r.id !== rowId ? r : { ...r, included: !r.included }))
  }

  // ── Import to DB ──────────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: async () => {
      const toImport = rows.filter(r => r.included)
      if (toImport.length === 0) throw new Error('Nenhum item selecionado para importar')

      const records = toImport.map(r => ({
        office_id: officeId!,
        company_id: companyId,
        description: r.description,
        ncm_current: r.ncmCode,
        cclasstrib_code: r.cClassTrib || null,
        base_cost: r.price || null,
        status: 'classified',
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
      toast.success(`${rows.filter(r => r.included).length} itens importados com sucesso!`)
      setStep('upload')
      setRows([])
      setXlsxRaw([])
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao importar'),
  })

  // ── Export template ───────────────────────────────────────────
  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { Descricao: 'Arroz branco polido tipo 1', NCM: '10063021', Preco: 5.90 },
      { Descricao: 'Notebook Dell 15 i7', NCM: '84713012', Preco: 3500.00 },
      { Descricao: 'Feijao carioca tipo 1 1kg', NCM: '07133310', Preco: 8.50 },
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
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Importar Produtos via Planilha
            <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              <Sparkles className="h-3 w-3" /> IA LC 214/2025
            </span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            NCM vem da planilha — cClassTrib IBS/CBS classificado automaticamente por Claude Haiku
          </p>
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
              (['upload', 'mapping', 'results'].indexOf(step) > i ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500')
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
          <p className="text-sm text-gray-500 mt-1 mb-2">Suporta .xlsx, .xls e .csv</p>
          <p className="text-xs text-gray-400 mb-6">
            A planilha deve conter colunas de <strong>Descrição</strong> e <strong>NCM</strong> (código de 8 dígitos)
          </p>
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
            O sistema usará o NCM da planilha e classificará o cClassTrib automaticamente via IA.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <label className="text-sm font-medium text-gray-700">Coluna: NCM *</label>
              <Select value={ncmCol} onValueChange={setNcmCol}>
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
          {descCol && ncmCol && (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                Prévia (primeiras 5 linhas)
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Descrição</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">NCM</th>
                    {priceCol && priceCol !== '__none__' && (
                      <th className="px-4 py-2 text-right text-xs text-gray-500 font-medium">Preço</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {xlsxRaw.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-gray-600">{String(row[descCol] || '')}</td>
                      <td className="px-4 py-2">
                        <code className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {normalizeNcm(row[ncmCol]) || '—'}
                        </code>
                      </td>
                      {priceCol && priceCol !== '__none__' && (
                        <td className="px-4 py-2 text-gray-400 text-right font-mono text-xs">
                          {String(row[priceCol] || '')}
                        </td>
                      )}
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
              disabled={!descCol || !ncmCol || !companyId}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Classificar cClassTrib em {xlsxRaw.length} produtos
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
                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Classificando cClassTrib via IA (LC 214/2025)…
                </span>
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
                { label: 'Total incluídos',   value: stats.total,  color: 'text-gray-900' },
                { label: 'Alta confiança',    value: stats.high,   color: 'text-green-600' },
                { label: 'Média confiança',   value: stats.medium, color: 'text-yellow-600' },
                { label: 'Baixa / nenhuma',   value: stats.low,    color: 'text-red-600' },
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
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="py-3 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && rows.every(r => r.included)}
                        onChange={e => setRows(prev => prev.map(r => ({ ...r, included: e.target.checked })))}
                        className="rounded"
                      />
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase min-w-[200px]">Descrição</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-28">NCM (planilha)</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-32">cClassTrib</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-16">CST</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase w-36">Regime</th>
                    <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 uppercase w-28">Red.IBS/CBS</th>
                    <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 uppercase w-28">Confiança</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase min-w-[200px]">Raciocínio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(row => {
                    const meta = CONFIDENCE_META[row.confidence] ?? CONFIDENCE_META.none
                    const ConfIcon = meta.icon
                    const isPending = row.status === 'processing' || (processing && row.status === 'pending')
                    return (
                      <tr key={row.id} className={cn('hover:bg-gray-50', !row.included && 'opacity-40')}>
                        {/* Checkbox */}
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={row.included}
                            onChange={() => toggleIncluded(row.id)}
                            className="rounded"
                          />
                        </td>

                        {/* Descrição */}
                        <td className="py-2.5 px-3">
                          <p className="text-gray-900 font-medium leading-snug">{row.description}</p>
                          {row.price != null && (
                            <p className="text-xs text-gray-400 font-mono">R$ {row.price.toFixed(2)}</p>
                          )}
                        </td>

                        {/* NCM da planilha */}
                        <td className="py-2.5 px-3">
                          <code className={cn(
                            'text-xs font-mono font-bold px-2 py-0.5 rounded',
                            row.ncmCode ? 'bg-gray-100 text-gray-700' : 'bg-red-50 text-red-400'
                          )}>
                            {row.ncmCode || '—'}
                          </code>
                        </td>

                        {/* cClassTrib */}
                        <td className="py-2.5 px-3">
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          ) : (
                            <div>
                              <code className={cn(
                                'text-xs font-mono font-bold px-2 py-0.5 rounded',
                                row.cClassTrib ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                              )}>
                                {row.cClassTrib || '—'}
                              </code>
                              {row.cClassTribDesc && (
                                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight line-clamp-2">
                                  {row.cClassTribDesc}
                                </p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* CST */}
                        <td className="py-2.5 px-3">
                          {row.cst && (
                            <code className="text-xs font-mono bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                              {row.cst}
                            </code>
                          )}
                        </td>

                        {/* Regime */}
                        <td className="py-2.5 px-3">
                          <p className="text-xs text-gray-600 leading-snug">{row.regime || '—'}</p>
                        </td>

                        {/* Red.IBS/CBS */}
                        <td className="py-2.5 px-3 text-center">
                          {row.status === 'done' && (
                            <div className="space-y-0.5">
                              <p className="text-xs font-mono text-gray-700">
                                <span className="text-gray-400">IBS </span>
                                {row.pRedIbs > 0 ? (
                                  <span className="text-green-600 font-semibold">{row.pRedIbs}%</span>
                                ) : '—'}
                              </p>
                              <p className="text-xs font-mono text-gray-700">
                                <span className="text-gray-400">CBS </span>
                                {row.pRedCbs > 0 ? (
                                  <span className="text-green-600 font-semibold">{row.pRedCbs}%</span>
                                ) : '—'}
                              </p>
                            </div>
                          )}
                        </td>

                        {/* Confiança */}
                        <td className="py-2.5 px-3 text-center">
                          {row.status === 'done' && (
                            <div className="flex flex-col items-center gap-1">
                              <span className={cn(
                                'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium',
                                meta.color
                              )}>
                                <ConfIcon className="h-3 w-3" />
                                {meta.label}
                              </span>
                              <div className="flex items-center gap-1">
                                {row.usedAI && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 font-medium">
                                    <Sparkles className="h-2.5 w-2.5" /> IA
                                  </span>
                                )}
                                {row.fromCache && (
                                  <span className="text-[10px] text-gray-400">(cache)</span>
                                )}
                              </div>
                            </div>
                          )}
                          {row.status === 'error' && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium bg-red-100 text-red-700 border-red-200">
                              <XCircle className="h-3 w-3" /> Erro
                            </span>
                          )}
                        </td>

                        {/* Raciocínio */}
                        <td className="py-2.5 px-3 max-w-xs">
                          {row.reasoning && (
                            <p className="text-xs text-gray-500 italic leading-snug line-clamp-3">
                              {row.reasoning}
                            </p>
                          )}
                        </td>
                      </tr>
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
                  <span className="text-xs text-gray-500">
                    {stats.total} itens selecionados
                  </span>
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
                  Importar {stats.total} itens
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
