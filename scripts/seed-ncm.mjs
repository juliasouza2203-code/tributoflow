import fs from 'fs'
import https from 'https'

const TOKEN = 'sbp_3e6ff85969e86ece179a9555c2ef4a7edd5c41ea'
const PROJECT = 'egwnftrxaaouvtsbcssf'

const raw = fs.readFileSync('C:/Users/Pedro Souza/Downloads/TributoFlow/ncm_temp.json', 'utf8')
const data = JSON.parse(raw)
const items = data.Nomenclaturas || data

function parseDate(s) {
  if (!s || s === '31/12/9999') return null
  const [d, m, y] = s.split('/')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function esc(s) {
  return String(s).replace(/'/g, "''").replace(/\x00/g, '')
}

const records = items
  .map(i => ({
    code: i.Codigo.replace(/[.\-]/g, ''),
    description: (i.Descricao || '').trim(),
    start_date: parseDate(i.Data_Inicio) || '2022-04-01',
    end_date: parseDate(i.Data_Fim),
    legal_ref: [i.Tipo_Ato_Ini, i.Numero_Ato_Ini, i.Ano_Ato_Ini]
      .filter(Boolean)
      .join(' ') || null,
  }))
  .filter(r => r.code && r.description)

console.log(`Total records: ${records.length}`)

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql })
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: `/v1/projects/${PROJECT}/database/query`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let d = ''
        res.on('data', c => (d += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(d))
          } catch {
            resolve(d)
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  const CHUNK = 200
  let inserted = 0

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK)

    const values = chunk
      .map(r => {
        const sd = `'${r.start_date}'`
        const ed = r.end_date ? `'${r.end_date}'` : 'NULL'
        const lr = r.legal_ref ? `'${esc(r.legal_ref)}'` : 'NULL'
        return `('${esc(r.code)}', '${esc(r.description)}', ${sd}, ${ed}, ${lr})`
      })
      .join(',\n')

    const sql = `
      INSERT INTO public.tax_ncm
        (code, description, start_date, end_date, legal_ref)
      VALUES ${values}
      ON CONFLICT (code) DO UPDATE
        SET description    = EXCLUDED.description,
            start_date     = EXCLUDED.start_date,
            end_date       = EXCLUDED.end_date,
            legal_ref      = EXCLUDED.legal_ref,
            last_update_at = NOW()
    `

    const result = await runQuery(sql)

    if (result && result.error) {
      console.error(`\nError at chunk ${i}:`, JSON.stringify(result.error))
      process.exit(1)
    }

    inserted += chunk.length
    process.stdout.write(`\rInserted: ${inserted}/${records.length}`)
  }

  console.log('\n✅ Seed concluído!')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
