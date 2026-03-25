-- ============================================================
-- TributoFlow — Migration 4: Price Scenarios
-- ============================================================

CREATE TABLE price_scenarios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  office_id       UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  scenario_name   TEXT NOT NULL,
  cost            NUMERIC(15, 4) NOT NULL,
  target_margin   NUMERIC(5, 4) NOT NULL,
  price_before    NUMERIC(15, 4) NOT NULL,
  price_after     NUMERIC(15, 4) NOT NULL,
  tax_load_before NUMERIC(15, 4) NOT NULL,
  tax_load_after  NUMERIC(15, 4) NOT NULL,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX price_scenarios_office_idx ON price_scenarios(office_id);
CREATE INDEX price_scenarios_company_idx ON price_scenarios(company_id);

-- ---------------------------------------------------------------
-- RPC: simulate_price_for_item
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.simulate_price_for_item(
  p_item_id       UUID,
  p_target_margin NUMERIC,
  p_legacy_rate   NUMERIC,
  p_ibs_state     NUMERIC DEFAULT 0.177,
  p_ibs_municipal NUMERIC DEFAULT 0.023,
  p_cbs           NUMERIC DEFAULT 0.088,
  p_reduction_ibs NUMERIC DEFAULT 0,
  p_reduction_cbs NUMERIC DEFAULT 0,
  p_scenario_name TEXT DEFAULT 'Simulação IBS/CBS'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id            UUID;
  v_item          RECORD;
  v_office        UUID := get_my_office_id();
  v_ibs_eff       NUMERIC;
  v_cbs_eff       NUMERIC;
  v_total_new     NUMERIC;
  v_price_before  NUMERIC;
  v_price_after   NUMERIC;
  v_tax_before    NUMERIC;
  v_tax_after     NUMERIC;
BEGIN
  SELECT * INTO v_item FROM items WHERE id = p_item_id AND office_id = v_office;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;

  v_ibs_eff := (p_ibs_state + p_ibs_municipal) * (1 - p_reduction_ibs);
  v_cbs_eff := p_cbs * (1 - p_reduction_cbs);
  v_total_new := v_ibs_eff + v_cbs_eff;

  v_price_before := COALESCE(v_item.base_cost, 0) / NULLIF(1 - p_target_margin, 0) * (1 + p_legacy_rate);
  v_price_after  := COALESCE(v_item.base_cost, 0) / NULLIF(1 - p_target_margin - v_total_new, 0);

  v_tax_before := v_price_before * p_legacy_rate;
  v_tax_after  := COALESCE(v_price_after, 0) * v_total_new;

  INSERT INTO price_scenarios (
    item_id, office_id, company_id, scenario_name,
    cost, target_margin, price_before, price_after,
    tax_load_before, tax_load_after, created_by
  ) VALUES (
    p_item_id, v_office, v_item.company_id, p_scenario_name,
    COALESCE(v_item.base_cost, 0), p_target_margin,
    COALESCE(v_price_before, 0), COALESCE(v_price_after, 0),
    COALESCE(v_tax_before, 0), COALESCE(v_tax_after, 0),
    auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- RLS
ALTER TABLE price_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_scenarios_tenant" ON price_scenarios FOR ALL
  USING (office_id = get_my_office_id())
  WITH CHECK (office_id = get_my_office_id());
