import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://egwnftrxaaouvtsbcssf.supabase.co'

// Legacy JWT anon key required for Edge Functions — the publishable key format (sb_publishable_*)
// does not work as Bearer token for Supabase Edge Functions (returns 401).
const RAW_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const supabaseKey = RAW_KEY?.startsWith('sb_')
  ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnd25mdHJ4YWFvdXZ0c2Jjc3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTY4MTAsImV4cCI6MjA4OTk3MjgxMH0.RATvNbBSsIY6cbi6Rd86NDjUcCad5HjSccGNw8-3NH4'
  : RAW_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnd25mdHJ4YWFvdXZ0c2Jjc3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTY4MTAsImV4cCI6MjA4OTk3MjgxMH0.RATvNbBSsIY6cbi6Rd86NDjUcCad5HjSccGNw8-3NH4'

if (!supabaseUrl || !supabaseKey) {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#f8fafc;">
      <div style="text-align:center;padding:2rem;max-width:420px;">
        <div style="font-size:2rem;margin-bottom:1rem;">⚙️</div>
        <h2 style="color:#1e293b;margin-bottom:.5rem;">Variáveis de ambiente não configuradas</h2>
        <p style="color:#64748b;font-size:.9rem;margin-bottom:1.5rem;">
          Adicione <strong>VITE_SUPABASE_URL</strong> e <strong>VITE_SUPABASE_ANON_KEY</strong>
          nas configurações do projeto no Vercel e faça um novo deploy.
        </p>
        <code style="background:#f1f5f9;padding:.5rem 1rem;border-radius:.5rem;font-size:.8rem;color:#475569;">
          Project Settings → Environment Variables
        </code>
      </div>
    </div>`
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient(supabaseUrl, supabaseKey) as any
