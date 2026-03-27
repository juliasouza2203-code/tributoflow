-- Cache for cClassTrib AI classifications
CREATE TABLE IF NOT EXISTS cclasstrib_ai_cache (
  description_hash      TEXT PRIMARY KEY,
  ncm_code              TEXT NOT NULL,
  cclasstrib_code       TEXT,
  cst_code              TEXT,
  cclasstrib_description TEXT,
  regime                TEXT,
  p_red_ibs             NUMERIC(5,2) DEFAULT 0,
  p_red_cbs             NUMERIC(5,2) DEFAULT 0,
  confidence            TEXT NOT NULL DEFAULT 'none',
  reasoning             TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cclasstrib_ai_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cclasstrib_cache_all ON cclasstrib_ai_cache;
CREATE POLICY cclasstrib_cache_all ON cclasstrib_ai_cache
  USING (true)
  WITH CHECK (true);
