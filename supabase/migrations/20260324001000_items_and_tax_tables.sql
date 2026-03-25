-- ============================================================
-- TributoFlow — Migration 2: Items and Tax Tables
-- ============================================================

-- ---------------------------------------------------------------
-- items
-- ---------------------------------------------------------------
CREATE TABLE items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  office_id       UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  code            TEXT,
  description     TEXT NOT NULL,
  item_type       item_type NOT NULL DEFAULT 'goods',
  ncm_current     TEXT,
  ncm_validated   TEXT,
  nbs_code        TEXT,
  unit            TEXT,
  base_cost       NUMERIC(15, 4),
  status          item_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX items_office_id_idx ON items(office_id);
CREATE INDEX items_company_id_idx ON items(company_id);
CREATE INDEX items_status_idx ON items(status);

-- ---------------------------------------------------------------
-- tax_ncm (global — no office_id)
-- ---------------------------------------------------------------
CREATE TABLE tax_ncm (
  code            TEXT PRIMARY KEY,
  description     TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE,
  legal_ref       TEXT,
  last_update_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- tax_cclasstrib (global)
-- ---------------------------------------------------------------
CREATE TABLE tax_cclasstrib (
  code            TEXT PRIMARY KEY,
  description     TEXT NOT NULL,
  article_ref     TEXT,
  regime_type     TEXT NOT NULL DEFAULT 'normal',
  p_red_ibs       NUMERIC(5, 2) NOT NULL DEFAULT 0,
  p_red_cbs       NUMERIC(5, 2) NOT NULL DEFAULT 0,
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,
  last_update_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- tax_cst_ibs_cbs (global)
-- ---------------------------------------------------------------
CREATE TABLE tax_cst_ibs_cbs (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  flags       JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------
-- tax_nbs_correlation (NBS x cClassTrib)
-- ---------------------------------------------------------------
CREATE TABLE tax_nbs_correlation (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nbs_code            TEXT NOT NULL,
  nbs_description     TEXT,
  cclasstrib_code     TEXT REFERENCES tax_cclasstrib(code),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- Seed cClassTrib demo data
-- ---------------------------------------------------------------
INSERT INTO tax_cclasstrib (code, description, article_ref, regime_type, p_red_ibs, p_red_cbs) VALUES
  ('01', 'Tributação Normal — alíquota cheia', 'Art. 12 LC 214/2025', 'normal', 0, 0),
  ('02', 'Redução 60% — Cesta Básica Ampliada', 'Anexo I LC 214/2025', 'reducao', 60, 60),
  ('03', 'Redução 100% — Cesta Básica Nacional', 'Anexo I LC 214/2025', 'isenta', 100, 100),
  ('04', 'Redução 30% — Saúde', 'Art. 47 LC 214/2025', 'reducao', 30, 30),
  ('05', 'Redução 40% — Educação', 'Art. 48 LC 214/2025', 'reducao', 40, 40),
  ('06', 'Imune — Serviços Religiosos', 'Art. 150 CF/88', 'imune', 100, 100),
  ('07', 'Monofásico — Combustíveis', 'Art. 65 LC 214/2025', 'monofasica', 0, 0),
  ('08', 'Redução 60% — Medicamentos', 'Anexo I LC 214/2025', 'reducao', 60, 60),
  ('09', 'Redução 30% — Transporte Público', 'Art. 52 LC 214/2025', 'reducao', 30, 30),
  ('10', 'Não tributado — Exportações', 'Art. 11 LC 214/2025', 'nao_tributado', 100, 100);

-- Seed CST IBS/CBS
INSERT INTO tax_cst_ibs_cbs (code, description, flags) VALUES
  ('01', 'Tributado integralmente', '{"tributado": true}'),
  ('02', 'Tributado com redução de alíquota', '{"tributado": true, "reducao": true}'),
  ('03', 'Isento', '{"isento": true}'),
  ('04', 'Imune', '{"imune": true}'),
  ('05', 'Não tributado', '{"nao_tributado": true}'),
  ('06', 'Monofásico — cobrado anteriormente', '{"monofasico": true}'),
  ('07', 'Diferido', '{"diferido": true}');

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_ncm ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_cclasstrib ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_cst_ibs_cbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_nbs_correlation ENABLE ROW LEVEL SECURITY;

-- items: isolated by office
CREATE POLICY "items_tenant" ON items FOR ALL
  USING (office_id = get_my_office_id())
  WITH CHECK (office_id = get_my_office_id());

-- Tax tables: public read for authenticated users
CREATE POLICY "tax_ncm_read" ON tax_ncm FOR SELECT TO authenticated USING (true);
CREATE POLICY "tax_cclasstrib_read" ON tax_cclasstrib FOR SELECT TO authenticated USING (true);
CREATE POLICY "tax_cst_read" ON tax_cst_ibs_cbs FOR SELECT TO authenticated USING (true);
CREATE POLICY "tax_nbs_read" ON tax_nbs_correlation FOR SELECT TO authenticated USING (true);
