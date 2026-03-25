-- ============================================================
-- TributoFlow — Migration 3: Classifications & Audit
-- ============================================================

-- ---------------------------------------------------------------
-- item_classifications
-- ---------------------------------------------------------------
CREATE TABLE item_classifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  office_id       UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  ncm_used        TEXT,
  nbs_used        TEXT,
  cst_ibs_cbs     TEXT REFERENCES tax_cst_ibs_cbs(code),
  cclasstrib_code TEXT REFERENCES tax_cclasstrib(code),
  justification   TEXT,
  legal_refs      JSONB NOT NULL DEFAULT '[]',
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          classification_status NOT NULL DEFAULT 'draft'
);

CREATE INDEX item_class_item_id_idx ON item_classifications(item_id);
CREATE INDEX item_class_office_id_idx ON item_classifications(office_id);
CREATE INDEX item_class_company_id_idx ON item_classifications(company_id);

-- ---------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  office_id   UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  action      audit_action NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  payload_diff JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_office_id_idx ON audit_logs(office_id);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);

-- ---------------------------------------------------------------
-- Auto-audit trigger for item_classifications
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_item_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (office_id, entity_type, entity_id, action, user_id, payload_diff)
    VALUES (NEW.office_id, 'classification', NEW.id, 'create', auth.uid(), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (office_id, entity_type, entity_id, action, user_id, payload_diff)
    VALUES (NEW.office_id, 'classification', NEW.id, 'update', auth.uid(),
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_classification
  AFTER INSERT OR UPDATE ON item_classifications
  FOR EACH ROW EXECUTE FUNCTION public.audit_item_classification();

-- ---------------------------------------------------------------
-- RPC: create_item_classification
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_item_classification(
  p_item_id       UUID,
  p_ncm_used      TEXT,
  p_nbs_used      TEXT,
  p_cst_ibs_cbs   TEXT,
  p_cclasstrib    TEXT,
  p_justification TEXT,
  p_legal_refs    JSONB DEFAULT '[]'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id        UUID;
  v_company   UUID;
  v_office    UUID := get_my_office_id();
BEGIN
  SELECT company_id INTO v_company FROM items WHERE id = p_item_id AND office_id = v_office;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Item not found or access denied'; END IF;

  INSERT INTO item_classifications (
    item_id, office_id, company_id, ncm_used, nbs_used,
    cst_ibs_cbs, cclasstrib_code, justification, legal_refs, created_by, status
  ) VALUES (
    p_item_id, v_office, v_company, p_ncm_used, p_nbs_used,
    p_cst_ibs_cbs, p_cclasstrib, p_justification, p_legal_refs, auth.uid(), 'approved'
  ) RETURNING id INTO v_id;

  UPDATE items SET status = 'classified' WHERE id = p_item_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
ALTER TABLE item_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classifications_tenant" ON item_classifications FOR ALL
  USING (office_id = get_my_office_id())
  WITH CHECK (office_id = get_my_office_id());

CREATE POLICY "audit_logs_tenant" ON audit_logs FOR ALL
  USING (office_id = get_my_office_id())
  WITH CHECK (office_id = get_my_office_id());
