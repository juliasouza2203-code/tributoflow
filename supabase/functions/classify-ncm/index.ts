import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

interface Candidate {
  code: string
  description: string
}

interface ClassifyRequest {
  description: string
  candidates: Candidate[]
}

interface ClassifyResponse {
  code: string | null
  ncmDescription: string | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  reasoning: string
  fromCache: boolean
}

// Normalize description for cache key
function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Simple hash using Web Crypto API
async function hashDescription(text: string): Promise<string> {
  const normalized = normalizeForHash(text)
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const supabase = createClient(supabaseUrl, supabaseKey)

    const body: ClassifyRequest = await req.json()
    const { description, candidates } = body

    if (!description || !candidates?.length) {
      return new Response(
        JSON.stringify({ error: 'description and candidates are required' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // 1. Check cache
    const hash = await hashDescription(description)
    const { data: cached } = await supabase
      .from('ncm_ai_cache')
      .select('ncm_code, ncm_description, confidence, reasoning')
      .eq('description_hash', hash)
      .maybeSingle()

    if (cached) {
      const response: ClassifyResponse = {
        code: cached.ncm_code,
        ncmDescription: cached.ncm_description,
        confidence: cached.confidence as ClassifyResponse['confidence'],
        reasoning: cached.reasoning,
        fromCache: true,
      }
      return new Response(JSON.stringify(response), { headers: corsHeaders })
    }

    // 2. No API key — fallback to first candidate
    if (!anthropicKey) {
      const best = candidates[0]
      return new Response(
        JSON.stringify({
          code: best.code,
          ncmDescription: best.description,
          confidence: 'low',
          reasoning: 'Classificação por similaridade de palavras-chave (IA não configurada).',
          fromCache: false,
        } as ClassifyResponse),
        { headers: corsHeaders }
      )
    }

    // 3. Call Claude Haiku
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    const candidateList = candidates
      .slice(0, 20)
      .map((c, i) => `${i + 1}. ${c.code} — ${c.description}`)
      .join('\n')

    const prompt = `Você é um especialista em classificação fiscal brasileira (NCM — Nomenclatura Comum do Mercosul).

Produto a classificar: "${description}"

Candidatos NCM disponíveis (código — descrição oficial da Receita Federal):
${candidateList}

Analise o produto e selecione o NCM mais adequado entre os candidatos acima.

Responda SOMENTE com um JSON válido, sem texto adicional:
{"code": "XXXXXXXX", "confidence": "high|medium|low|none", "reasoning": "explicação breve em português"}

Regras:
- "code" deve ser exatamente um dos códigos listados acima (8 dígitos sem pontos), ou "none" se nenhum for adequado
- "confidence": high = certeza, medium = provável, low = possível, none = sem candidato adequado
- "reasoning": máximo 80 palavras explicando por que esse NCM foi escolhido`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'

    // Parse JSON response from Claude
    let parsed: { code: string; confidence: string; reasoning: string }
    try {
      // Extract JSON from response (Claude might add markdown)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText)
    } catch {
      // Parse failed — fallback to first candidate
      parsed = {
        code: candidates[0].code,
        confidence: 'low',
        reasoning: 'Resposta da IA não pôde ser interpretada. Usando melhor candidato por palavras-chave.',
      }
    }

    // Find matching candidate for description
    const matchedCandidate = candidates.find(c => c.code === parsed.code)
    const finalCode = matchedCandidate ? parsed.code : (parsed.code === 'none' ? null : candidates[0].code)
    const finalDescription = matchedCandidate?.description ?? candidates[0]?.description ?? null
    const finalConfidence = (['high', 'medium', 'low', 'none'].includes(parsed.confidence)
      ? parsed.confidence
      : 'low') as ClassifyResponse['confidence']

    // 4. Save to cache
    await supabase.from('ncm_ai_cache').upsert({
      description_hash: hash,
      ncm_code: finalCode,
      ncm_description: finalDescription,
      confidence: finalConfidence,
      reasoning: parsed.reasoning || '',
      created_at: new Date().toISOString(),
    })

    const response: ClassifyResponse = {
      code: finalCode,
      ncmDescription: finalDescription,
      confidence: finalConfidence,
      reasoning: parsed.reasoning || '',
      fromCache: false,
    }

    return new Response(JSON.stringify(response), { headers: corsHeaders })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: corsHeaders }
    )
  }
})
