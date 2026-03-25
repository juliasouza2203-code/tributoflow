/**
 * Client helper para chamar a Edge Function consulta-ncm-cff
 * que faz proxy para o Portal Conformidade Fácil (SVRS/SEFAZ).
 */

export interface CffCard {
  cst: string
  cclasstrib: string
  description: string
  badge: string
  url: string
}

export interface CffResult {
  ncm: string
  dfeType: string
  cards: CffCard[]
  error?: string
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/consulta-ncm-cff`

export async function consultarNcmCff(ncm: string, dfeType: 'NFE' | 'NFCE' = 'NFE'): Promise<CffResult> {
  const clean = ncm.replace(/[.\-\s]/g, '')

  const res = await fetch(`${FUNCTION_URL}?ncm=${clean}&dfeType=${dfeType}`, {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Erro ${res.status}: ${text}`)
  }

  return res.json()
}
