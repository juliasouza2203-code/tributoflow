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

    // 3. Build prompt with ALL candidates + NCM chapter context
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    const candidateList = (hasCandidates ? candidates : [])
      .map((c, i) =>
        `${i + 1}. ${c.code} (CST ${c.cst}) — ${c.description}${c.p_red_ibs > 0 ? ` [Red.IBS ${c.p_red_ibs}% / Red.CBS ${c.p_red_cbs}%]` : ''}`
      )
      .join('\n')

    // Derive NCM chapter for contextual hints
    const ncmChapter = ncmCode.substring(0, 2)

    const prompt = `Você é o maior especialista em tributação brasileira da LC 214/2025 (reforma tributária IBS/CBS).
Você tem conhecimento profundo de TODOS os Anexos da LC 214/2025.

PRODUTO A CLASSIFICAR:
- NCM: ${ncmCode} (Capítulo ${ncmChapter})
- Descrição: "${description}"

REFERÊNCIA RÁPIDA DE ANEXOS DA LC 214/2025:
- Anexo I (art. 127): Cesta Básica Nacional — alíquota ZERO (100% redução) — arroz, feijão, farinha de mandioca, pão, leite, café, açúcar, óleo de soja, banana, batata, etc.
- Anexo IV (art. 133): Medicamentos registrados na Anvisa — 60% redução
- Anexo V (art. 133 §3): Medicamentos com alíquota ZERO (100% redução) — oncológicos, HIV, diabetes, etc.
- Anexo VI (art. 134): Dispositivos médicos e de acessibilidade — 60% redução
- Anexo VII (art. 136): Serviços de saúde — 60% redução
- Anexo VIII (art. 137): Alimentos para consumo humano (não cesta básica) — 60% redução — inclui carnes, peixes, produtos de panificação, massas, óleos vegetais, conservas, sucos, etc.
- Anexo IX (art. 138): INSUMOS AGROPECUÁRIOS E AQUÍCOLAS — 60% redução — INCLUI: fertilizantes, defensivos agrícolas, INSETICIDAS, FUNGICIDAS, HERBICIDAS, sementes, mudas, rações animais, vacinas veterinárias, máquinas agrícolas, tratores, implementos agrícolas, NCMs dos capítulos 31, 38 (defensivos/pesticidas), 12 (sementes), 23 (rações), 84 (máquinas agrícolas), 87 (tratores)
- Anexo X (art. 139): Produtos de higiene pessoal e limpeza — 60% redução — sabonete, pasta de dente, papel higiênico, água sanitária, detergente
- Anexo XI (art. 140): Serviços de educação — 60% redução
- Anexo XVII (art. 434): Bens e serviços com alíquota fixa (cigarros, bebidas alcoólicas)
- Combustíveis: tributação monofásica (CST 620)
- Exportações: imunidade (CST 410)

REGRA FUNDAMENTAL: NÃO escolha 000001 (tributação integral) se o produto se encaixa em qualquer Anexo acima. 000001 é APENAS para produtos que não têm NENHUM benefício fiscal na LC 214/2025.

LISTA COMPLETA DE cClassTrib DISPONÍVEIS:
${candidateList}

Responda SOMENTE com JSON válido:
{"code": "XXXXXX", "confidence": "high|medium|low", "reasoning": "justificativa citando o Anexo e artigo da LC 214/2025"}

- "code": exatamente 6 dígitos da lista acima
- "confidence": high = certeza do Anexo, medium = provável, low = incerto
- "reasoning": cite o Anexo e artigo específico, máximo 120 palavras`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
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
