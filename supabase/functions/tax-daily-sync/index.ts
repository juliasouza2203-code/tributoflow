import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Verify authorization
  const syncSecret = Deno.env.get('SYNC_SECRET_KEY')
  const authHeader = req.headers.get('Authorization')

  // Allow either SYNC_SECRET_KEY or valid Supabase service role
  if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!authHeader?.includes(supabaseKey || '___none___')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      })
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const results: any[] = []
  const errors: string[] = []

  // 1. Sync NCM from Receita Federal
  try {
    const ncmRes = await fetch('https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json')
    if (!ncmRes.ok) throw new Error(`NCM API HTTP ${ncmRes.status}`)
    const ncmData = await ncmRes.json()
    const items = ncmData.Nomenclaturas || ncmData || []

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

    let updated = 0
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500)
      const { error } = await supabase.from('tax_ncm').upsert(chunk, { onConflict: 'code' })
      if (error) errors.push(`NCM chunk ${i}: ${error.message}`)
      else updated += chunk.length
    }

    await supabase.from('tax_sync_logs').insert({
      source: 'NCM_RECEITA',
      status: errors.length ? 'partial' : 'success',
      records_updated: updated,
      error_message: errors.length ? errors.join('; ') : null,
    })
    results.push({ source: 'NCM_RECEITA', updated, errors: [...errors] })
    errors.length = 0
  } catch (err: any) {
    const msg = `NCM sync failed: ${err.message}`
    errors.push(msg)
    await supabase.from('tax_sync_logs').insert({
      source: 'NCM_RECEITA', status: 'error', records_updated: 0, error_message: msg,
    }).catch(() => {})
    results.push({ source: 'NCM_RECEITA', updated: 0, error: msg })
  }

  // 2. Sync cClassTrib via CFF API (mTLS)
  try {
    const certPem = Deno.env.get('CFF_CERT_PEM')
    const certKey = Deno.env.get('CFF_CERT_KEY')

    if (certPem && certKey) {
      const cffRes = await fetch('https://cff.svrs.rs.gov.br/api/v1/consultas/classTrib', {
        // Note: Deno supports TLS client certificates via Deno.HttpClient
        // For now, this is a best-effort attempt
      })

      if (cffRes.ok) {
        const cffData = await cffRes.json()
        const cstSet = new Map<string, any>()
        const ccRecords: any[] = []

        for (const item of (cffData || [])) {
          const cstCode = item.cst || ''
          if (cstCode && !cstSet.has(cstCode)) {
            cstSet.set(cstCode, {
              code: cstCode,
              description: item.descricaoCst || cstCode,
              flags: item.indicadores || {},
              last_synced_at: new Date().toISOString(),
            })
          }

          ccRecords.push({
            code: item.cClassTrib,
            description: item.descricao || '',
            cst_code: cstCode || null,
            ind_op: item.indOp || null,
            p_red_ibs: item.pRedIBS ?? null,
            p_red_cbs: item.pRedCBS ?? null,
            article_ref: null,
            indicators: item.indicadores || {},
            start_date: item.dIniVig || null,
            end_date: item.dFimVig || null,
            last_synced_at: new Date().toISOString(),
          })
        }

        if (cstSet.size > 0) {
          await supabase.from('tax_cst_ibs_cbs').upsert(Array.from(cstSet.values()), { onConflict: 'code' })
        }

        let updated = 0
        for (let i = 0; i < ccRecords.length; i += 200) {
          const chunk = ccRecords.slice(i, i + 200)
          const { error } = await supabase.from('tax_cclasstrib').upsert(chunk, { onConflict: 'code' })
          if (error) errors.push(`cClassTrib chunk ${i}: ${error.message}`)
          else updated += chunk.length
        }

        await supabase.from('tax_sync_logs').insert({
          source: 'CLASSTRIB_CFF_API',
          status: errors.length ? 'partial' : 'success',
          records_updated: updated,
          error_message: errors.length ? errors.join('; ') : null,
        })
        results.push({ source: 'CLASSTRIB_CFF_API', updated })
      } else {
        throw new Error(`CFF API HTTP ${cffRes.status}`)
      }
    } else {
      results.push({ source: 'CLASSTRIB_CFF_API', skipped: true, reason: 'No mTLS certificates configured' })
    }
  } catch (err: any) {
    results.push({ source: 'CLASSTRIB_CFF_API', error: err.message, fallback: 'Will try XLS' })

    // Fallback to XLS
    try {
      const xlsRes = await fetch('https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=IqSrmDiYSTw=')
      if (xlsRes.ok) {
        results.push({ source: 'CLASSTRIB_XLS_FALLBACK', status: 'XLS downloaded, parse not available in Edge Function' })
      }
    } catch { /* ignore fallback failure */ }
  }

  const summary = {
    executedAt: new Date().toISOString(),
    results,
    totalSources: results.length,
  }

  return new Response(JSON.stringify(summary), { headers: corsHeaders })
})
