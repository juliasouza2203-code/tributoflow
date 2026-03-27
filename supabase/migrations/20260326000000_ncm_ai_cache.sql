-- ============================================================
-- TributoFlow — Migration 8: NCM AI Classification Cache
-- Caches AI-generated NCM classifications to avoid repeat API calls
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ncm_ai_cache (
  description_hash TEXT        PRIMARY KEY,  -- SHA-256 of normalized description
  ncm_code         TEXT,
  ncm_description  TEXT,
  confidence       TEXT        NOT NULL DEFAULT 'low',
  reasoning        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cache cleanup (delete entries older than N days)
CREATE INDEX IF NOT EXISTS ncm_ai_cache_created_at_idx
  ON public.ncm_ai_cache (created_at);

-- RLS: only service_role (Edge Function) can read/write
ALTER TABLE public.ncm_ai_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ncm_ai_cache_service_all"
  ON public.ncm_ai_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE public.ncm_ai_cache IS
  'Cache of AI-generated NCM classifications. TTL ~90 days via scheduled cleanup.';
