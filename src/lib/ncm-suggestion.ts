/**
 * NCM Suggestion Engine
 * Primary: AI classification via Edge Function (Claude Haiku + retrieve-then-rank)
 * Fallback: keyword-based search against tax_ncm table
 */

import { supabase } from '@/integrations/supabase/client'

export interface NcmSuggestion {
  code: string
  description: string
  score: number  // relevance score (higher = better match)
  legal_ref: string | null
}

/**
 * Normalize text for search: remove accents, lowercase, trim
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Maps common Brazilian product/service colloquial names to official NCM terminology.
 * Allows keyword search to find items even when the user uses everyday language.
 */
const NCM_SYNONYMS: Record<string, string[]> = {
  // Informática / Eletrônicos
  notebook:    ['portateis', 'processamento'],
  laptop:      ['portateis', 'processamento'],
  computador:  ['processamento', 'dados'],
  desktop:     ['processamento', 'dados'],
  celular:     ['telefonicos', 'moveis'],
  smartphone:  ['telefonicos', 'moveis'],
  tablet:      ['portateis', 'processamento'],
  monitor:     ['monitores', 'video'],
  impressora:  ['impressoras'],
  teclado:     ['teclados'],
  mouse:       ['dispositivos'],
  roteador:    ['roteadores', 'redes'],
  tv:          ['televisao', 'receptores'],
  televisao:   ['televisao', 'receptores'],
  camera:      ['cameras', 'fotograficas'],
  // Eletrodomésticos
  geladeira:   ['refrigeradores'],
  refrigerador:['refrigeradores'],
  fogao:       ['fogoes', 'cozinhar'],
  microondas:  ['microondas'],
  lavadora:    ['maquinas', 'lavar'],
  maquina:     ['maquinas'],
  // Veículos
  carro:       ['automoveis', 'veiculos'],
  veiculo:     ['veiculos', 'automoveis'],
  moto:        ['motocicletas', 'ciclomotores'],
  caminhao:    ['veiculos', 'carga'],
  // Alimentos
  arroz:       ['arroz'],
  feijao:      ['feijao'],
  carne:       ['carnes', 'bovinos'],
  frango:      ['galos', 'galinhas', 'frangos'],
  peixe:       ['peixes'],
  acucar:      ['acucares'],
  cafe:        ['cafe'],
  // Vestuário
  camisa:      ['camisas'],
  calca:       ['calcas', 'vestuario'],
  sapato:      ['calcados'],
  tenis:       ['calcados'],
  roupa:       ['vestuario', 'confeccoes'],
  // Construção / Materiais
  cimento:     ['cimento'],
  tijolo:      ['tijolos'],
  tinta:       ['tintas'],
  cabo:        ['cabos'],
  fio:         ['fios'],
  tubo:        ['tubos'],
  // Móveis
  cadeira:     ['cadeiras', 'assentos'],
  mesa:        ['mesas', 'moveis'],
  sofa:        ['sofas', 'assentos'],
  cama:        ['camas'],
  armario:     ['armarios', 'moveis'],
  // Medicamentos / Saúde
  medicamento: ['medicamentos', 'farmaceuticos'],
  remedio:     ['medicamentos', 'farmaceuticos'],
  vacina:      ['vacinas'],
  // Serviços (sem NCM, mas tenta NBS)
  consultoria: ['servicos', 'tecnologia'],
  servico:     ['servicos'],
  manutencao:  ['manutencao', 'reparacao'],
}

/**
 * Extract meaningful keywords from a product/service description.
 * Expands colloquial terms to official NCM terminology via synonym map.
 */
function extractKeywords(description: string): string[] {
  const stopWords = new Set([
    'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
    'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as', 'e', 'ou',
    'para', 'por', 'com', 'sem', 'sob', 'sobre', 'entre', 'ate',
    'que', 'se', 'mais', 'menos', 'muito', 'pouco', 'todo', 'toda',
    'outro', 'outra', 'outros', 'outras', 'este', 'esta', 'esse',
    'essa', 'aquele', 'aquela', 'tipo', 'unidade', 'peca', 'pecas',
    'produto', 'item', 'material', 'uso', 'geral',
  ])

  const normalized = normalize(description)
  const rawWords = normalized
    .split(' ')
    .filter(w => w.length >= 3 && !stopWords.has(w))

  // Expand synonyms: replace/augment words found in the synonym map
  const expanded: string[] = []
  for (const word of rawWords) {
    const synonyms = NCM_SYNONYMS[word]
    if (synonyms) {
      expanded.push(...synonyms) // use official terms
    } else {
      expanded.push(word) // keep original if not in map
    }
  }

  // Deduplicate and limit
  return [...new Set(expanded)].slice(0, 8)
}

/**
 * Score a candidate NCM description against search keywords
 */
function scoreMatch(ncmDesc: string, keywords: string[]): number {
  const normalizedDesc = normalize(ncmDesc)
  let score = 0

  for (const kw of keywords) {
    if (normalizedDesc.includes(kw)) {
      // Exact substring match
      score += 10
      // Bonus for word boundary match
      const regex = new RegExp(`\\b${kw}\\b`)
      if (regex.test(normalizedDesc)) {
        score += 5
      }
    }
  }

  return score
}

/**
 * Search NCM codes by item description keywords
 * Uses Supabase ilike queries for each keyword, then scores results
 */
export async function suggestNcm(description: string, limit = 8): Promise<NcmSuggestion[]> {
  const keywords = extractKeywords(description)
  if (keywords.length === 0) return []

  // Build OR filter: match any keyword in NCM description
  const filters = keywords.map(kw => `description.ilike.%${kw}%`)
  const orFilter = filters.join(',')

  const { data, error } = await supabase
    .from('tax_ncm')
    .select('code, description, legal_ref')
    .or(orFilter)
    .is('end_date', null) // only active codes
    .limit(50)

  if (error || !data) return []

  // Score and rank results
  const scored: NcmSuggestion[] = data.map(ncm => ({
    code: ncm.code,
    description: ncm.description,
    score: scoreMatch(ncm.description, keywords),
    legal_ref: ncm.legal_ref,
  }))

  // Sort by score descending, take top results
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Validate if an NCM code exists and is currently active
 */
export async function validateNcm(code: string): Promise<{
  valid: boolean
  expired: boolean
  description: string | null
  suggestion?: string
}> {
  if (!code || code.trim().length < 4) {
    return { valid: false, expired: false, description: null, suggestion: 'Codigo NCM deve ter pelo menos 4 digitos' }
  }

  const cleanCode = code.replace(/[.\-\s]/g, '')

  const { data, error } = await supabase
    .from('tax_ncm')
    .select('code, description, start_date, end_date')
    .eq('code', cleanCode)
    .maybeSingle()

  if (error || !data) {
    return {
      valid: false,
      expired: false,
      description: null,
      suggestion: `NCM ${cleanCode} nao encontrado na tabela oficial`,
    }
  }

  const now = new Date()
  const endDate = data.end_date ? new Date(data.end_date) : null

  if (endDate && endDate < now) {
    return {
      valid: false,
      expired: true,
      description: data.description,
      suggestion: `NCM ${cleanCode} esta vencido desde ${endDate.toLocaleDateString('pt-BR')}`,
    }
  }

  return {
    valid: true,
    expired: false,
    description: data.description,
  }
}

export type NcmConfidence = 'high' | 'medium' | 'low' | 'none'

export interface NcmBestMatch {
  suggestion: NcmSuggestion | null
  confidence: NcmConfidence
  allSuggestions: NcmSuggestion[]
}

/**
 * Returns the single best NCM match for a product description.
 * Always returns a result (even if low confidence) for bulk import use cases.
 */
export async function getBestNcmMatch(description: string): Promise<NcmBestMatch> {
  const results = await suggestNcm(description, 8)

  if (results.length === 0) {
    // Fallback: try shorter keywords / looser search
    const words = normalize(description).split(' ').filter(w => w.length >= 4).slice(0, 3)
    if (words.length === 0) return { suggestion: null, confidence: 'none', allSuggestions: [] }

    const { data } = await supabase
      .from('tax_ncm')
      .select('code, description, legal_ref')
      .ilike('description', `%${words[0]}%`)
      .is('end_date', null)
      .limit(20)

    if (!data || data.length === 0) return { suggestion: null, confidence: 'none', allSuggestions: [] }

    const keywords = extractKeywords(description)
    const scored: NcmSuggestion[] = data
      .map(ncm => ({ code: ncm.code, description: ncm.description, score: scoreMatch(ncm.description, keywords), legal_ref: ncm.legal_ref }))
      .sort((a, b) => b.score - a.score)

    const best = scored[0]
    return {
      suggestion: best,
      confidence: best.score >= 10 ? 'low' : 'none',
      allSuggestions: scored.slice(0, 5),
    }
  }

  const best = results[0]
  const confidence: NcmConfidence =
    best.score >= 25 ? 'high' :
    best.score >= 10 ? 'medium' :
    best.score >= 1  ? 'low' : 'none'

  return { suggestion: best, confidence, allSuggestions: results.slice(0, 5) }
}

/**
 * Search NCM by direct code prefix (for autocomplete)
 */
export async function searchNcmByCode(codePrefix: string, limit = 10): Promise<NcmSuggestion[]> {
  const clean = codePrefix.replace(/[.\-\s]/g, '')
  if (clean.length < 2) return []

  const { data, error } = await supabase
    .from('tax_ncm')
    .select('code, description, legal_ref')
    .like('code', `${clean}%`)
    .is('end_date', null)
    .limit(limit)

  if (error || !data) return []

  return data.map(ncm => ({
    code: ncm.code,
    description: ncm.description,
    score: 100,
    legal_ref: ncm.legal_ref,
  }))
}

// ── AI Classification ─────────────────────────────────────────────

export interface NcmAiResult extends NcmBestMatch {
  reasoning: string
  fromCache: boolean
  usedAI: boolean
}

/**
 * Classify NCM using Claude Haiku via Edge Function (retrieve-then-rank).
 * Step 1: keyword matching fetches top 20 candidates from tax_ncm
 * Step 2: Edge Function sends candidates + description to Claude
 * Step 3: Claude returns best NCM + confidence + reasoning
 * Fallback: if Edge Function fails, returns keyword-only best match
 */
export async function classifyNcmWithAI(description: string): Promise<NcmAiResult> {
  // Step 1: keyword candidates (now enriched with synonym expansion)
  const candidates = await suggestNcm(description, 20)

  try {
    // Step 2: call Edge Function — always, even with 0 candidates.
    // When candidates = [], Claude classifies purely from its knowledge of Brazilian NCM.
    const { data, error } = await supabase.functions.invoke('classify-ncm', {
      body: {
        description,
        candidates: candidates.map(c => ({ code: c.code, description: c.description })),
      },
    })

    if (error || !data?.code) throw new Error(error?.message || 'No result from AI')

    // Step 3: find the full description from candidates or use what Claude returned
    const candidateMatch = candidates.find(c => c.code === data.code)
    const matchedSuggestion: NcmSuggestion = {
      code: data.code,
      description: candidateMatch?.description || data.ncmDescription || '',
      score: data.confidence === 'high' ? 100 : data.confidence === 'medium' ? 60 : 20,
      legal_ref: candidateMatch?.legal_ref ?? null,
    }

    return {
      suggestion: matchedSuggestion,
      confidence: data.confidence ?? 'none',
      allSuggestions: candidates.slice(0, 5),
      reasoning: data.reasoning || '',
      fromCache: data.fromCache ?? false,
      usedAI: true,
    }
  } catch {
    // Fallback to keyword-only best match
    const fallback = await getBestNcmMatch(description)
    return {
      ...fallback,
      reasoning: candidates.length === 0
        ? 'Nenhum candidato encontrado por palavras-chave. Verifique a descrição ou use a busca manual.'
        : 'Classificação por similaridade de palavras-chave (IA temporariamente indisponível).',
      fromCache: false,
      usedAI: false,
    }
  }
}
