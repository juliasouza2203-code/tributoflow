/**
 * NCM Suggestion Engine
 * Searches the tax_ncm table by keywords extracted from item descriptions.
 * Since we don't have a real AI/RAG backend, this uses keyword-based search
 * against the official NCM descriptions stored in Supabase.
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
 * Extract meaningful keywords from a product/service description
 * Removes common stop words in Portuguese
 */
function extractKeywords(description: string): string[] {
  const stopWords = new Set([
    'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
    'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as', 'e', 'ou',
    'para', 'por', 'com', 'sem', 'sob', 'sobre', 'entre', 'ate',
    'que', 'se', 'mais', 'menos', 'muito', 'pouco', 'todo', 'toda',
    'outro', 'outra', 'outros', 'outras', 'este', 'esta', 'esse',
    'essa', 'aquele', 'aquela', 'tipo', 'unidade', 'peca', 'pecas',
    'produto', 'servico', 'item', 'material', 'uso', 'geral',
  ])

  const normalized = normalize(description)
  return normalized
    .split(' ')
    .filter(w => w.length >= 3 && !stopWords.has(w))
    .slice(0, 6) // max 6 keywords
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
