/**
 * Edge Function: consulta-ncm-cff
 * Proxy para o Portal Conformidade Fácil (SVRS/SEFAZ-RS)
 * Busca classificações tributárias cClassTrib + CST para um NCM dado.
 *
 * URL: https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributariaNcm?ncm={ncm}&dfeTypes=NFE
 */

const CFF_BASE = 'https://dfe-portal.svrs.rs.gov.br'

interface CffCard {
  cst: string
  cclasstrib: string
  description: string
  badge: string
  url: string
}

interface CffResponse {
  ncm: string
  dfeType: string
  cards: CffCard[]
  error?: string
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#xE7;/g, 'ç')
    .replace(/&#xE3;/g, 'ã')
    .replace(/&#xE1;/g, 'á')
    .replace(/&#xE9;/g, 'é')
    .replace(/&#xED;/g, 'í')
    .replace(/&#xF3;/g, 'ó')
    .replace(/&#xFA;/g, 'ú')
    .replace(/&#xF5;/g, 'õ')
    .replace(/&#xE2;/g, 'â')
    .replace(/&#xEA;/g, 'ê')
    .replace(/&#xF4;/g, 'ô')
    .replace(/&#xC7;/g, 'Ç')
    .replace(/&#xC3;/g, 'Ã')
    .trim()
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

function parseCards(html: string): CffCard[] {
  const cards: CffCard[] = []

  // Match each result-card div
  const cardPattern = /<div class="result-card[^"]*"\s+data-cst="([^"]+)"\s+data-class-trib="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="result-card|<\/div>)/g

  let match
  while ((match = cardPattern.exec(html)) !== null) {
    const cst = match[1].trim()
    const cclasstrib = match[2].trim()
    const inner = match[3]

    // Extract card-code (cClassTrib display)
    const codeMatch = inner.match(/<h4 class="card-code">([\s\S]*?)<\/h4>/)
    const code = codeMatch ? stripTags(codeMatch[1]) : cclasstrib

    // Extract card-desc
    const descMatch = inner.match(/<p class="card-desc">([\s\S]*?)<\/p>/)
    const description = descMatch ? decodeHtmlEntities(stripTags(descMatch[1])) : ''

    // Extract badge
    const badgeMatch = inner.match(/<span class="card-badge[^"]*">([\s\S]*?)<\/span>/)
    const badge = badgeMatch ? decodeHtmlEntities(stripTags(badgeMatch[1])) : ''

    // Extract onclick URL
    const onclickMatch = inner.match(/onclick="location\.href='([^']+)'"/)
    const url = onclickMatch ? CFF_BASE + onclickMatch[1] : `${CFF_BASE}/CFF/ClassificacaoTributaria?cClass=${cclasstrib}`

    if (cclasstrib && description) {
      cards.push({ cst, cclasstrib: code || cclasstrib, description, badge, url })
    }
  }

  return cards
}

Deno.serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const ncm = url.searchParams.get('ncm') || ''
    const dfeType = url.searchParams.get('dfeType') || 'NFE'

    if (!ncm || ncm.length < 4) {
      return new Response(
        JSON.stringify({ error: 'NCM inválido. Informe pelo menos 4 dígitos.' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const cleanNcm = ncm.replace(/[.\-\s]/g, '')
    const portalUrl = `${CFF_BASE}/CFF/ClassificacaoTributariaNcm?ncm=${cleanNcm}&dfeTypes=${dfeType}`

    const response = await fetch(portalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    })

    if (!response.ok) {
      throw new Error(`Portal CFF retornou status ${response.status}`)
    }

    const html = await response.text()
    const cards = parseCards(html)

    const result: CffResponse = {
      ncm: cleanNcm,
      dfeType,
      cards,
    }

    return new Response(JSON.stringify(result), { headers: corsHeaders })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Erro ao consultar portal CFF' }),
      { status: 500, headers: corsHeaders }
    )
  }
})
