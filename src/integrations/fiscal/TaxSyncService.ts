import { supabase } from '@/integrations/supabase/client'

interface SyncResult {
  source: string
  updated: number
  errors: string[]
  status: 'success' | 'partial' | 'error'
}

// 1. syncNCM() - Fetch from Receita Federal open JSON API
export async function syncNCM(): Promise<SyncResult> {
  const source = 'NCM_RECEITA'
  const errors: string[] = []
  let updated = 0

  try {
    const res = await fetch('https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    // Normalize: the API returns { Nomenclaturas: [...] } with objects like:
    // { Codigo, Descricao, DataInicio, DataFim, TipoAto, NumeroAto, AnoAto }
    const items = (data.Nomenclaturas || data || [])
    const records = items
      .filter((item: any) => item.Codigo && item.Codigo.length >= 4)
      .map((item: any) => ({
        code: item.Codigo.replace(/\./g, ''),
        description: item.Descricao || '',
        start_date: item.DataInicio || null,
        end_date: item.DataFim || null,
        legal_act_type: item.TipoAto || null,
        legal_act_number: item.NumeroAto || null,
        legal_act_year: item.AnoAto || null,
        last_synced_at: new Date().toISOString(),
      }))

    // Batch upsert in chunks of 500
    const CHUNK = 500
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK)
      const { error } = await (supabase.from('tax_ncm') as any).upsert(chunk, { onConflict: 'code' })
      if (error) {
        errors.push(`Chunk ${i}-${i+CHUNK}: ${error.message}`)
      } else {
        updated += chunk.length
      }
    }

    // Log sync result
    await (supabase.from('tax_sync_logs') as any).insert({
      source,
      status: errors.length ? 'partial' : 'success',
      records_updated: updated,
      error_message: errors.length ? errors.join('; ') : null,
    })

    return { source, updated, errors, status: errors.length ? 'partial' : 'success' }
  } catch (err: any) {
    const msg = err.message || 'Unknown error'
    await (supabase.from('tax_sync_logs') as any).insert({
      source, status: 'error', records_updated: 0, error_message: msg,
    }).catch(() => {})
    return { source, updated: 0, errors: [msg], status: 'error' }
  }
}

// 2. syncClassTribAPI() - For mTLS API (Edge Function only, placeholder for browser)
export async function syncClassTribAPI(): Promise<SyncResult> {
  // mTLS requires server-side execution (Edge Function)
  // This is a placeholder that returns an error when called from browser
  return {
    source: 'CLASSTRIB_CFF_API',
    updated: 0,
    errors: ['mTLS sync only available via Edge Function (server-side)'],
    status: 'error',
  }
}

// 3. syncClassTribXLS() - Fetch XLS from nfe.fazenda.gov.br
export async function syncClassTribXLS(): Promise<SyncResult> {
  const source = 'CLASSTRIB_XLS_FALLBACK'
  const errors: string[] = []
  let updated = 0

  try {
    const res = await fetch('https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=IqSrmDiYSTw=')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buffer = await res.arrayBuffer()

    // Dynamic import xlsx
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(ws)

    // Normalize - expected columns may vary, try common patterns:
    // cClassTrib, Descricao, CST, pRedIBS, pRedCBS, etc.
    const cstSet = new Map<string, any>()
    const cclasstribRecords: any[] = []

    for (const row of rows) {
      const code = String(row.cClassTrib || row['cClassTrib'] || row['Código'] || row.Codigo || '').trim()
      if (!code) continue

      const cstCode = String(row.CST || row.cst || row['CST IBS/CBS'] || '').trim()
      const description = String(row.Descricao || row['Descrição'] || row.descricao || row.Description || '').trim()

      if (cstCode && !cstSet.has(cstCode)) {
        cstSet.set(cstCode, {
          code: cstCode,
          description: String(row['Descrição CST'] || row.DescricaoCST || row.descricaoCst || cstCode),
          flags: {},
          last_synced_at: new Date().toISOString(),
        })
      }

      cclasstribRecords.push({
        code,
        description,
        cst_code: cstCode || null,
        ind_op: String(row.indOp || row.IndOp || row['Ind Op'] || '').trim() || null,
        p_red_ibs: parseFloat(row.pRedIBS || row['pRedIBS'] || '0') || null,
        p_red_cbs: parseFloat(row.pRedCBS || row['pRedCBS'] || '0') || null,
        article_ref: String(row.artigo || row.Artigo || row.article_ref || '').trim() || null,
        indicators: row.indicadores ? (typeof row.indicadores === 'string' ? JSON.parse(row.indicadores) : row.indicadores) : {},
        start_date: row.dIniVig || row.DataInicio || null,
        end_date: row.dFimVig || row.DataFim || null,
        last_synced_at: new Date().toISOString(),
      })
    }

    // Upsert CST first
    if (cstSet.size > 0) {
      const { error } = await (supabase.from('tax_cst_ibs_cbs') as any).upsert(
        Array.from(cstSet.values()), { onConflict: 'code' }
      )
      if (error) errors.push(`CST upsert: ${error.message}`)
    }

    // Upsert cClassTrib in chunks
    const CHUNK = 200
    for (let i = 0; i < cclasstribRecords.length; i += CHUNK) {
      const chunk = cclasstribRecords.slice(i, i + CHUNK)
      const { error } = await (supabase.from('tax_cclasstrib') as any).upsert(chunk, { onConflict: 'code' })
      if (error) errors.push(`cClassTrib chunk ${i}: ${error.message}`)
      else updated += chunk.length
    }

    await (supabase.from('tax_sync_logs') as any).insert({
      source, status: errors.length ? 'partial' : 'success',
      records_updated: updated, error_message: errors.length ? errors.join('; ') : null,
    }).catch(() => {})

    return { source, updated, errors, status: errors.length ? 'partial' : 'success' }
  } catch (err: any) {
    const msg = err.message || 'Unknown error'
    await (supabase.from('tax_sync_logs') as any).insert({
      source, status: 'error', records_updated: 0, error_message: msg,
    }).catch(() => {})
    return { source, updated: 0, errors: [msg], status: 'error' }
  }
}

// 4. syncNBSCorrelation() - Fetch NBS x cClassTrib XLS
export async function syncNBSCorrelation(): Promise<SyncResult> {
  const source = 'NBS_CORRELATION_NFSe'
  const errors: string[] = []
  let updated = 0

  try {
    const url = 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-00-00.xls'
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buffer = await res.arrayBuffer()

    const XLSX = await import('xlsx')
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(ws)

    const records = rows
      .filter((r: any) => r.NBS || r.nbs_code || r['Item NBS'])
      .map((r: any) => ({
        nbs_code: String(r.NBS || r.nbs_code || r['Item NBS'] || '').trim(),
        ind_op: String(r.IndOp || r.indOp || r['Ind Op'] || '').trim() || null,
        cclasstrib_code: String(r.cClassTrib || r['cClassTrib IBS/CBS'] || '').trim() || null,
        last_synced_at: new Date().toISOString(),
      }))
      .filter((r: any) => r.nbs_code && r.cclasstrib_code)

    // Delete old correlation data and insert fresh
    await (supabase.from('tax_nbs_correlation') as any).delete().neq('id', '00000000-0000-0000-0000-000000000000')

    const CHUNK = 200
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK)
      const { error } = await (supabase.from('tax_nbs_correlation') as any).insert(chunk)
      if (error) errors.push(`NBS chunk ${i}: ${error.message}`)
      else updated += chunk.length
    }

    await (supabase.from('tax_sync_logs') as any).insert({
      source, status: errors.length ? 'partial' : 'success',
      records_updated: updated, error_message: errors.length ? errors.join('; ') : null,
    }).catch(() => {})

    return { source, updated, errors, status: errors.length ? 'partial' : 'success' }
  } catch (err: any) {
    const msg = err.message || 'Unknown error'
    await (supabase.from('tax_sync_logs') as any).insert({
      source, status: 'error', records_updated: 0, error_message: msg,
    }).catch(() => {})
    return { source, updated: 0, errors: [msg], status: 'error' }
  }
}

// 5. runFullSync() - Execute all syncs in sequence
export async function runFullSync(): Promise<{
  results: SyncResult[]
  summary: { total: number; succeeded: number; failed: number }
}> {
  const results: SyncResult[] = []

  // NCM first
  results.push(await syncNCM())

  // cClassTrib XLS (CFF API requires mTLS, use XLS as primary for browser)
  results.push(await syncClassTribXLS())

  // NBS correlation
  results.push(await syncNBSCorrelation())

  const succeeded = results.filter(r => r.status === 'success').length
  const failed = results.filter(r => r.status === 'error').length

  return {
    results,
    summary: { total: results.length, succeeded, failed },
  }
}
