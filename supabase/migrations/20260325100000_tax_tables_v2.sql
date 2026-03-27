-- ============================================================
-- TributoFlow — Migration 6: Tax Tables v2
-- ALTER existing tax tables to add missing columns;
-- CREATE tax_sync_logs table.
-- ============================================================

-- ---------------------------------------------------------------
-- tax_ncm — add missing columns
-- ---------------------------------------------------------------
ALTER TABLE public.tax_ncm
  ADD COLUMN IF NOT EXISTS legal_act_type   TEXT,
  ADD COLUMN IF NOT EXISTS legal_act_number TEXT,
  ADD COLUMN IF NOT EXISTS legal_act_year   TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at   TIMESTAMPTZ DEFAULT NOW();

-- ---------------------------------------------------------------
-- tax_cst_ibs_cbs — add last_synced_at
-- ---------------------------------------------------------------
ALTER TABLE public.tax_cst_ibs_cbs
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NOW();

-- ---------------------------------------------------------------
-- tax_cclasstrib — add missing columns
-- ---------------------------------------------------------------
ALTER TABLE public.tax_cclasstrib
  ADD COLUMN IF NOT EXISTS cst_code       TEXT REFERENCES public.tax_cst_ibs_cbs(code),
  ADD COLUMN IF NOT EXISTS ind_op         TEXT,
  ADD COLUMN IF NOT EXISTS indicators     JSONB,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NOW();

-- ---------------------------------------------------------------
-- tax_nbs_correlation — add missing columns
-- ---------------------------------------------------------------
ALTER TABLE public.tax_nbs_correlation
  ADD COLUMN IF NOT EXISTS ind_op         TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NOW();

-- ---------------------------------------------------------------
-- tax_sync_logs (new table)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_sync_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,
  status          TEXT NOT NULL,
  records_updated INT,
  error_message   TEXT,
  executed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- RLS for tax_sync_logs
-- ---------------------------------------------------------------
ALTER TABLE public.tax_sync_logs ENABLE ROW LEVEL SECURITY;

-- Only service_role can INSERT into tax_sync_logs
CREATE POLICY "tax_sync_logs_insert_service"
  ON public.tax_sync_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Only service_role can SELECT from tax_sync_logs
CREATE POLICY "tax_sync_logs_select_service"
  ON public.tax_sync_logs
  FOR SELECT
  TO service_role
  USING (true);
