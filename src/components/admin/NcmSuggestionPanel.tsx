import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Lightbulb, Search, Loader2, Copy, CheckCircle, AlertTriangle } from 'lucide-react'
import { suggestNcm, validateNcm, searchNcmByCode, type NcmSuggestion } from '@/lib/ncm-suggestion'
import { toast } from 'sonner'

interface NcmSuggestionPanelProps {
  itemDescription?: string
  currentNcm?: string | null
  onSelectNcm?: (code: string, description: string) => void
}

export function NcmSuggestionPanel({ itemDescription, currentNcm, onSelectNcm }: NcmSuggestionPanelProps) {
  const [suggestions, setSuggestions] = useState<NcmSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [searchMode, setSearchMode] = useState<'description' | 'code'>('description')
  const [searchInput, setSearchInput] = useState('')
  const [validation, setValidation] = useState<{ valid: boolean; expired: boolean; description: string | null; suggestion?: string } | null>(null)
  const [validating, setValidating] = useState(false)

  async function handleSuggest() {
    const query = searchInput || itemDescription
    if (!query) return toast.info('Informe uma descricao para buscar')
    setLoading(true)
    setSuggestions([])
    try {
      const results = searchMode === 'description'
        ? await suggestNcm(query)
        : await searchNcmByCode(query)
      setSuggestions(results)
      if (results.length === 0) toast.info('Nenhum NCM encontrado. Tente outros termos.')
    } catch {
      toast.error('Erro ao buscar NCMs')
    }
    setLoading(false)
  }

  async function handleValidate() {
    if (!currentNcm) return
    setValidating(true)
    setValidation(null)
    try {
      const result = await validateNcm(currentNcm)
      setValidation(result)
    } catch {
      toast.error('Erro ao validar NCM')
    }
    setValidating(false)
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    toast.success(`NCM ${code} copiado!`)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-gray-900 text-sm">Sugestao de NCM</h3>
        </div>
        <p className="text-xs text-gray-500 mt-1">Busque NCMs por descricao ou codigo na tabela oficial</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Validation of current NCM */}
        {currentNcm && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">NCM atual:</span>
              <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{currentNcm}</code>
              <Button size="sm" variant="outline" onClick={handleValidate} disabled={validating} className="h-6 text-xs gap-1">
                {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                Validar
              </Button>
            </div>
            {validation && (
              <div className={`text-xs p-2 rounded ${validation.valid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {validation.valid ? (
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> NCM valido — {validation.description}</span>
                ) : (
                  <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {validation.suggestion}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Search mode toggle */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setSearchMode('description')}
            className={`flex-1 text-xs py-1.5 px-3 rounded-md transition-colors ${searchMode === 'description' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Por descricao
          </button>
          <button
            onClick={() => setSearchMode('code')}
            className={`flex-1 text-xs py-1.5 px-3 rounded-md transition-colors ${searchMode === 'code' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Por codigo
          </button>
        </div>

        {/* Search input */}
        <div className="flex gap-2">
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={searchMode === 'description' ? 'Ex: arroz branco polido...' : 'Ex: 1006...'}
            className="text-sm"
            onKeyDown={e => e.key === 'Enter' && handleSuggest()}
          />
          <Button onClick={handleSuggest} disabled={loading} size="sm" className="gap-1 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
        </div>

        {/* Use item description shortcut */}
        {itemDescription && searchMode === 'description' && (
          <button
            onClick={() => { setSearchInput(itemDescription); }}
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Usar descricao do item: "{itemDescription.length > 50 ? itemDescription.slice(0, 50) + '...' : itemDescription}"
          </button>
        )}

        {/* Results */}
        {suggestions.length > 0 && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            <p className="text-xs font-medium text-gray-500">{suggestions.length} resultados encontrados:</p>
            {suggestions.map((s, idx) => (
              <div
                key={`${s.code}-${idx}`}
                className="flex items-start gap-2 p-2.5 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono font-bold text-blue-600">{s.code}</code>
                    {s.score >= 20 && <Badge variant="success" className="text-[10px] px-1.5 py-0">Alta relevancia</Badge>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{s.description}</p>
                </div>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs gap-1"
                    onClick={() => copyCode(s.code)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  {onSelectNcm && (
                    <Button
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => onSelectNcm(s.code, s.description)}
                    >
                      Usar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
