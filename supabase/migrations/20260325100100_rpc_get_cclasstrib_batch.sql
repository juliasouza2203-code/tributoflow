-- ============================================================
-- TributoFlow — Migration 7: RPC get_cclasstrib_batch
-- Batch lookup of cClassTrib options for a list of items,
-- with NCM validation and NBS-based filtering for services.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_cclasstrib_batch(items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  item jsonb;
  ncm_row record;
  ncm_valid boolean;
  ncm_desc text;
  ncm_msg text;
  options jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    -- Validate NCM
    SELECT INTO ncm_row code, description FROM tax_ncm
    WHERE code = (item->>'ncm_code')
    AND (end_date IS NULL OR end_date >= CURRENT_DATE);

    IF ncm_row IS NULL THEN
      ncm_valid := false;
      ncm_desc := '';
      ncm_msg := 'NCM não encontrado ou fora de vigência';
      options := '[]'::jsonb;
    ELSE
      ncm_valid := true;
      ncm_desc := ncm_row.description;
      ncm_msg := NULL;

      -- Get cClassTrib options
      IF (item->>'is_service')::boolean AND item->>'nbs_code' IS NOT NULL THEN
        SELECT jsonb_agg(jsonb_build_object(
          'cClassTrib', ct.code,
          'description', ct.description,
          'cstCode', COALESCE(ct.cst_code, ''),
          'cstDescription', COALESCE(cst.description, ''),
          'articleRef', COALESCE(ct.article_ref, ''),
          'pRedIBS', ct.p_red_ibs,
          'pRedCBS', ct.p_red_cbs,
          'indOp', COALESCE(ct.ind_op, ''),
          'indicators', COALESCE(ct.indicators, '{}'::jsonb)
        )) INTO options
        FROM tax_nbs_correlation nbs
        JOIN tax_cclasstrib ct ON ct.code = nbs.cclasstrib_code
        LEFT JOIN tax_cst_ibs_cbs cst ON cst.code = ct.cst_code
        WHERE nbs.nbs_code = (item->>'nbs_code')
        AND (ct.end_date IS NULL OR ct.end_date >= CURRENT_DATE);
      ELSE
        SELECT jsonb_agg(jsonb_build_object(
          'cClassTrib', ct.code,
          'description', ct.description,
          'cstCode', COALESCE(ct.cst_code, ''),
          'cstDescription', COALESCE(cst.description, ''),
          'articleRef', COALESCE(ct.article_ref, ''),
          'pRedIBS', ct.p_red_ibs,
          'pRedCBS', ct.p_red_cbs,
          'indOp', COALESCE(ct.ind_op, ''),
          'indicators', COALESCE(ct.indicators, '{}'::jsonb)
        )) INTO options
        FROM tax_cclasstrib ct
        LEFT JOIN tax_cst_ibs_cbs cst ON cst.code = ct.cst_code
        WHERE (ct.end_date IS NULL OR ct.end_date >= CURRENT_DATE);
      END IF;
    END IF;

    result := result || jsonb_build_array(jsonb_build_object(
      'itemId', item->>'item_id',
      'ncmCode', item->>'ncm_code',
      'ncmDescription', ncm_desc,
      'ncmValid', ncm_valid,
      'ncmValidationMessage', ncm_msg,
      'options', COALESCE(options, '[]'::jsonb)
    ));
  END LOOP;

  RETURN result;
END;
$$;
