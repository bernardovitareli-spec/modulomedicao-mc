CREATE OR REPLACE FUNCTION public.faturar_medicao(_medicao_id uuid, _numero_nf text, _data_emissao date, _valor numeric, _data_vencimento date, _observacoes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _atual medicao_status; _uid uuid := auth.uid();
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','faturamento']::app_role[]);
  IF _numero_nf IS NULL OR length(trim(_numero_nf)) = 0 THEN RAISE EXCEPTION 'Número da NF obrigatório'; END IF;
  IF _valor IS NULL OR _valor <= 0 THEN RAISE EXCEPTION 'Valor da NF deve ser maior que zero'; END IF;
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual <> 'aprovada_cliente' THEN RAISE EXCEPTION 'Apenas medições Aprovadas pelo cliente podem ser faturadas'; END IF;

  INSERT INTO faturas (medicao_id, numero_nf, data_emissao, valor, valor_bruto, valor_liquido, data_vencimento, observacoes, status, created_by)
  VALUES (_medicao_id, _numero_nf, _data_emissao, _valor, _valor, _valor, _data_vencimento, _observacoes, 'nf_emitida'::faturamento_status, _uid);

  UPDATE medicoes SET status = 'faturada', updated_at = now() WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'faturada', NULL, _observacoes,
    jsonb_build_object('numero_nf', _numero_nf, 'valor_nf', _valor, 'data_emissao', _data_emissao, 'data_vencimento', _data_vencimento));
END;
$function$;