import { createClient } from '@supabase/supabase-js'

// Supabase project config — anon key is public by design (VITE_ prefix = client-side safe)
const supabaseUrl = 'https://egwnftrxaaouvtsbcssf.supabase.co'
// JWT anon key required for Edge Functions. The newer publishable key format (sb_publishable_*)
// is NOT compatible as a Bearer token for Supabase Edge Functions (returns 401).
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnd25mdHJ4YWFvdXZ0c2Jjc3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTY4MTAsImV4cCI6MjA4OTk3MjgxMH0.RATvNbBSsIY6cbi6Rd86NDjUcCad5HjSccGNw8-3NH4'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient(supabaseUrl, supabaseKey) as any
