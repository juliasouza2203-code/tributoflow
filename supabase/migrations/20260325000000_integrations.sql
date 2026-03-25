-- ============================================================
-- TributoFlow — Migration 5: Integrations & Office Fiscal Params
-- ============================================================

-- ---------------------------------------------------------------
-- office_integrations: stores API connections per office
-- ---------------------------------------------------------------
CREATE TABLE office_integrations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  office_id       UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,  -- 'conformidade_facil', 'sefaz_nfe', 'erp_generic'
  display_name    TEXT NOT NULL,
  api_url         TEXT,
  api_key         TEXT,           -- encrypted at app level
  is_active       BOOLEAN NOT NULL DEFAULT false,
  last_sync_at    TIMESTAMPTZ,
  config          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(office_id, provider)
);

ALTER TABLE office_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integrations_tenant" ON office_integrations FOR ALL
  USING (office_id = get_my_office_id())
  WITH CHECK (office_id = get_my_office_id());

-- ---------------------------------------------------------------
-- office_fiscal_params: custom tax rates per office
-- ---------------------------------------------------------------
CREATE TABLE office_fiscal_params (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  office_id       UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE UNIQUE,
  ibs_state       NUMERIC(5,3) NOT NULL DEFAULT 17.7,
  ibs_municipal   NUMERIC(5,3) NOT NULL DEFAULT 2.3,
  cbs             NUMERIC(5,3) NOT NULL DEFAULT 8.8,
  default_markup  NUMERIC(5,2) NOT NULL DEFAULT 30,
  legacy_tax_rate NUMERIC(5,4) NOT NULL DEFAULT 27.65,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE office_fiscal_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_params_tenant" ON office_fiscal_params FOR ALL
  USING (office_id = get_my_office_id())
  WITH CHECK (office_id = get_my_office_id());
