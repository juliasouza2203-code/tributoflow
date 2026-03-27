import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

interface CClassTribCandidate {
  code: string
  description: string
  cst: string
  regime: string
  p_red_ibs: number
  p_red_cbs: number
}

interface ClassifyRequest {
  description: string
  ncmCode: string
  candidates: CClassTribCandidate[]
}

interface ClassifyResponse {
  code: string
  cstCode: string
  description: string
  regime: string
  pRedIbs: number
  pRedCbs: number
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

// SHA-256 hash using Web Crypto API (Deno compatible)
async function hashKey(ncmCode: string, description: string): Promise<string> {
  const normalized = normalizeForHash(description)
  const key = `${ncmCode}|${normalized}`
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
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
    const { description, ncmCode, candidates } = body

    if (!description) {
      return new Response(
        JSON.stringify({ error: 'description is required' }),
        { status: 400, headers: corsHeaders }
      )
    }

    if (!ncmCode) {
      return new Response(
        JSON.stringify({ error: 'ncmCode is required' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const hasCandidates = Array.isArray(candidates) && candidates.length > 0

    // 1. Check cache — key is SHA-256 of "ncmCode|normalizedDescription"
    const hash = await hashKey(ncmCode, description)
    const { data: cached } = await supabase
      .from('cclasstrib_ai_cache')
      .select('cclasstrib_code, cst_code, cclasstrib_description, regime, p_red_ibs, p_red_cbs, confidence, reasoning')
      .eq('description_hash', hash)
      .maybeSingle()

    if (cached) {
      const response: ClassifyResponse = {
        code: cached.cclasstrib_code,
        cstCode: cached.cst_code,
        description: cached.cclasstrib_description,
        regime: cached.regime,
        pRedIbs: cached.p_red_ibs,
        pRedCbs: cached.p_red_cbs,
        confidence: cached.confidence as ClassifyResponse['confidence'],
        reasoning: cached.reasoning,
        fromCache: true,
      }
      return new Response(JSON.stringify(response), { headers: corsHeaders })
    }

    // 2. No API key — fallback to first candidate with low confidence
    if (!anthropicKey) {
      if (!hasCandidates) {
        return new Response(
          JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured and no candidates available' }),
          { status: 500, headers: corsHeaders }
        )
      }
      const best = candidates[0]
      return new Response(
        JSON.stringify({
          code: best.code,
          cstCode: best.cst,
          description: best.description,
          regime: best.regime,
          pRedIbs: best.p_red_ibs,
          pRedCbs: best.p_red_cbs,
          confidence: 'low',
          reasoning: 'Classificação automática indisponível (IA não configurada). Primeiro registro retornado como padrão.',
          fromCache: false,
        } as ClassifyResponse),
        { headers: corsHeaders }
      )
    }

    // 3. Build prompt — list up to 80 most relevant candidates to keep token count manageable
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    const candidateList = (hasCandidates ? candidates.slice(0, 80) : [])
      .map((c, i) =>
        `${i + 1}. Código: ${c.code} | CST: ${c.cst} | Regime: ${c.regime} | Red.IBS: ${c.p_red_ibs}% | Red.CBS: ${c.p_red_cbs}% | Descrição: ${c.description}`
      )
      .join('\n')

    const prompt = `Você é um especialista em tributação brasileira conforme a Lei Complementar 214/2025 (reforma tributária IBS/CBS).

Dado o produto com NCM ${ncmCode} e descrição: "${description}"

Escolha o cClassTrib (Classe Tributária IBS/CBS) mais adequado da lista abaixo:

${candidateList}

Retorne SOMENTE um JSON válido, sem texto adicional:
{"code": "XXXXXX", "cstCode": "XXX", "description": "descrição do cClassTrib escolhido", "regime": "regime tributário", "pRedIbs": 0.0, "pRedCbs": 0.0, "confidence": "high|medium|low|none", "reasoning": "explicação breve em português"}

Regras:
- "code": código de 6 dígitos do cClassTrib escolhido (exatamente como na lista)
- "cstCode": código CST de 3 dígitos correspondente
- "description": descrição do cClassTrib conforme a lista
- "regime": regime tributário (ex: "Tributação Normal", "Redução de Alíquota", "Isenção", etc.)
- "pRedIbs": percentual de redução IBS (número decimal, ex: 60.0)
- "pRedCbs": percentual de redução CBS (número decimal, ex: 60.0)
- "confidence": high = certeza, medium = provável, low = possível, none = não determinado
- "reasoning": máximo 100 palavras explicando a escolha com base na LC 214/2025`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'

    // Parse JSON response
    let parsed: {
      code: string
      cstCode?: string
      description?: string
      regime?: string
      pRedIbs?: number
      pRedCbs?: number
      confidence: string
      reasoning: string
    }

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText)
    } catch {
      // Parse failed — fallback
      const fallback = hasCandidates ? candidates[0] : null
      parsed = {
        code: fallback?.code ?? '',
        cstCode: fallback?.cst ?? '',
        description: fallback?.description ?? '',
        regime: fallback?.regime ?? '',
        pRedIbs: fallback?.p_red_ibs ?? 0,
        pRedCbs: fallback?.p_red_cbs ?? 0,
        confidence: fallback ? 'low' : 'none',
        reasoning: 'Resposta da IA não pôde ser interpretada. Classificação padrão aplicada.',
      }
    }

    // Match the chosen code against candidates list
    const matchedCandidate = hasCandidates
      ? candidates.find(c => c.code === parsed.code)
      : null

    const finalCode = parsed.code ?? (hasCandidates ? candidates[0].code : '')
    const finalCstCode = parsed.cstCode ?? matchedCandidate?.cst ?? finalCode.substring(0, 3)
    const finalDescription = parsed.description ?? matchedCandidate?.description ?? ''
    const finalRegime = parsed.regime ?? matchedCandidate?.regime ?? ''
    const finalPRedIbs = typeof parsed.pRedIbs === 'number' ? parsed.pRedIbs : (matchedCandidate?.p_red_ibs ?? 0)
    const finalPRedCbs = typeof parsed.pRedCbs === 'number' ? parsed.pRedCbs : (matchedCandidate?.p_red_cbs ?? 0)
    const finalConfidence = (['high', 'medium', 'low', 'none'].includes(parsed.confidence)
      ? parsed.confidence
      : 'low') as ClassifyResponse['confidence']

    // 4. Save to cache
    await supabase.from('cclasstrib_ai_cache').upsert({
      description_hash: hash,
      ncm_code: ncmCode,
      cclasstrib_code: finalCode,
      cst_code: finalCstCode,
      cclasstrib_description: finalDescription,
      regime: finalRegime,
      p_red_ibs: finalPRedIbs,
      p_red_cbs: finalPRedCbs,
      confidence: finalConfidence,
      reasoning: parsed.reasoning || '',
      created_at: new Date().toISOString(),
    })

    const response: ClassifyResponse = {
      code: finalCode,
      cstCode: finalCstCode,
      description: finalDescription,
      regime: finalRegime,
      pRedIbs: finalPRedIbs,
      pRedCbs: finalPRedCbs,
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
