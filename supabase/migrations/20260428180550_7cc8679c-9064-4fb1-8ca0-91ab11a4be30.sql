
-- Helper: pega regra vigente para item (prioriza equipamento_id)
CREATE OR REPLACE FUNCTION public._regra_vigente(
  _contrato_id uuid, _equipamento_id uuid, _tipo public.regra_tipo, _data date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(r.*)
  FROM public.contrato_regras r
  WHERE r.contrato_id = _contrato_id
    AND r.tipo = _tipo
    AND r.ativa = true
    AND r.vigencia_inicio <= _data
    AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= _data)
  ORDER BY (r.equipamento_id = _equipamento_id) DESC NULLS LAST,
           r.equipamento_id IS NOT NULL DESC,
           r.vigencia_inicio DESC
  LIMIT 1;
$$;

-- Núcleo: calcula um item segundo regras vigentes; retorna jsonb com novos valores e regras aplicadas
CREATE OR REPLACE FUNCTION public._calc_item_com_regras(_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it record; med record; ctr record; eqid uuid; data_ref date;
  r_vh jsonb; r_gar jsonb; r_mec jsonb; r_chuv jsonb; r_exc jsonb;
  r_dm jsonb; r_compl jsonb; r_pers jsonb;
  v_valor_hora numeric; v_garantia numeric;
  v_horas_mec numeric; v_horas_liq numeric; v_horas_pagar numeric;
  v_valor_bruto numeric; v_compl numeric; v_desc numeric; v_final numeric;
  aplicadas jsonb := '[]'::jsonb;
  desconta_mec boolean := true;
  modo_chuvoso text := 'normal';
BEGIN
  SELECT * INTO it FROM public.medicao_itens WHERE id = _item_id;
  SELECT * INTO med FROM public.medicoes WHERE id = it.medicao_id;
  SELECT * INTO ctr FROM public.contratos WHERE id = med.contrato_id;
  eqid := it.equipamento_id;
  data_ref := COALESCE(it.periodo_fim, med.competencia, current_date);

  r_vh    := public._regra_vigente(ctr.id, eqid, 'valor_hora', data_ref);
  r_gar   := public._regra_vigente(ctr.id, eqid, 'garantia_minima', data_ref);
  r_mec   := public._regra_vigente(ctr.id, eqid, 'desconto_horas_mecanicas', data_ref);
  r_chuv  := public._regra_vigente(ctr.id, eqid, 'periodo_chuvoso', data_ref);
  r_exc   := public._regra_vigente(ctr.id, eqid, 'excecao_chuvoso', data_ref);
  r_dm    := public._regra_vigente(ctr.id, eqid, 'desconto_manual', data_ref);
  r_compl := public._regra_vigente(ctr.id, eqid, 'complementar', data_ref);
  r_pers  := public._regra_vigente(ctr.id, eqid, 'regra_personalizada', data_ref);

  -- Valor/hora
  IF r_vh IS NOT NULL THEN
    v_valor_hora := COALESCE((r_vh->'parametros'->>'valor')::numeric, it.valor_hora);
    aplicadas := aplicadas || jsonb_build_object('tipo','valor_hora','origem','regra','valor', v_valor_hora,'regra_id', r_vh->>'id');
  ELSE
    v_valor_hora := it.valor_hora;
  END IF;

  -- Garantia
  IF r_gar IS NOT NULL THEN
    v_garantia := COALESCE((r_gar->'parametros'->>'horas')::numeric, it.garantia_minima);
    aplicadas := aplicadas || jsonb_build_object('tipo','garantia_minima','origem','regra','horas', v_garantia,'regra_id', r_gar->>'id');
  ELSE
    v_garantia := it.garantia_minima;
  END IF;

  -- Desconto de horas mecânicas
  IF r_mec IS NOT NULL THEN
    desconta_mec := COALESCE((r_mec->'parametros'->>'aplicar')::boolean, true);
    aplicadas := aplicadas || jsonb_build_object('tipo','desconto_horas_mecanicas','origem','regra','aplicar', desconta_mec,'regra_id', r_mec->>'id');
  END IF;
  v_horas_mec := CASE WHEN desconta_mec THEN it.horas_mecanicas ELSE 0 END;

  -- Período chuvoso / exceção
  IF r_chuv IS NOT NULL THEN
    modo_chuvoso := COALESCE(r_chuv->'parametros'->>'modo','normal');
    aplicadas := aplicadas || jsonb_build_object('tipo','periodo_chuvoso','origem','regra','modo', modo_chuvoso,'regra_id', r_chuv->>'id');
  END IF;
  IF r_exc IS NOT NULL AND it.horas_excecao_chuvoso > 0 THEN
    modo_chuvoso := 'normal';
    aplicadas := aplicadas || jsonb_build_object('tipo','excecao_chuvoso','origem','regra','modo','normal','regra_id', r_exc->>'id');
  END IF;

  -- Cálculo horas
  v_horas_liq := GREATEST(0, it.horas_informadas - v_horas_mec);
  IF modo_chuvoso = 'somente_informadas' THEN
    v_horas_pagar := v_horas_liq;
  ELSIF modo_chuvoso = 'sem_garantia' THEN
    v_horas_pagar := v_horas_liq;
  ELSE
    v_horas_pagar := GREATEST(v_horas_liq, v_garantia);
  END IF;

  v_valor_bruto := v_horas_pagar * v_valor_hora;

  -- Complementar
  v_compl := COALESCE(it.valor_complementares, 0);
  IF r_compl IS NOT NULL THEN
    v_compl := COALESCE((r_compl->'parametros'->>'valor_fixo')::numeric, 0)
             + COALESCE((r_compl->'parametros'->>'percentual')::numeric, 0) * v_valor_bruto / 100;
    aplicadas := aplicadas || jsonb_build_object('tipo','complementar','origem','regra','valor', v_compl,'regra_id', r_compl->>'id');
  END IF;

  -- Desconto manual
  v_desc := COALESCE(it.valor_descontos, 0);
  IF r_dm IS NOT NULL THEN
    v_desc := COALESCE((r_dm->'parametros'->>'valor_fixo')::numeric, 0)
            + COALESCE((r_dm->'parametros'->>'percentual')::numeric, 0) * v_valor_bruto / 100;
    aplicadas := aplicadas || jsonb_build_object('tipo','desconto_manual','origem','regra','valor', v_desc,'regra_id', r_dm->>'id');
  END IF;

  IF r_pers IS NOT NULL THEN
    aplicadas := aplicadas || jsonb_build_object('tipo','regra_personalizada','origem','regra',
      'nome', r_pers->'parametros'->>'nome',
      'descricao', r_pers->'parametros'->>'descricao',
      'observacao', r_pers->'parametros'->>'observacao',
      'regra_id', r_pers->>'id');
  END IF;

  v_final := v_valor_bruto + v_compl - v_desc;
  IF v_final < 0 THEN v_final := 0; END IF;

  RETURN jsonb_build_object(
    'item_id', it.id,
    'equipamento_id', it.equipamento_id,
    'valor_atual', it.valor_final,
    'valor_recalculado', v_final,
    'diferenca', v_final - it.valor_final,
    'novos', jsonb_build_object(
      'valor_hora', v_valor_hora, 'garantia_minima', v_garantia,
      'horas_mecanicas_efetivas', v_horas_mec,
      'horas_liquidas', v_horas_liq, 'horas_a_pagar', v_horas_pagar,
      'valor_bruto', v_valor_bruto, 'valor_complementares', v_compl,
      'valor_descontos', v_desc, 'valor_final', v_final
    ),
    'regras_aplicadas', aplicadas
  );
END; $$;

-- Simulação (read-only)
CREATE OR REPLACE FUNCTION public.simular_regras_medicao(_medicao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it record; res jsonb := '[]'::jsonb; calc jsonb;
  total_atual numeric := 0; total_novo numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  FOR it IN SELECT id FROM public.medicao_itens WHERE medicao_id = _medicao_id LOOP
    calc := public._calc_item_com_regras(it.id);
    res := res || calc;
    total_atual := total_atual + COALESCE((calc->>'valor_atual')::numeric, 0);
    total_novo  := total_novo + COALESCE((calc->>'valor_recalculado')::numeric, 0);
  END LOOP;
  RETURN jsonb_build_object(
    'medicao_id', _medicao_id,
    'total_atual', total_atual,
    'total_recalculado', total_novo,
    'diferenca', total_novo - total_atual,
    'itens', res
  );
END; $$;

-- Aplicação efetiva
CREATE OR REPLACE FUNCTION public.aplicar_regras_medicao(_medicao_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_email text;
  v_med record; v_contrato record; v_cliente record;
  it record; v_eq record;
  calc jsonb; novos jsonb; n int := 0;
  v_old_final numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo da aplicação é obrigatório (mínimo 5 caracteres)';
  END IF;
  v_role := public.get_primary_role(v_uid);
  IF v_role NOT IN ('admin','gestor_contrato','operacional') THEN
    RAISE EXCEPTION 'Sem permissão para aplicar regras';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_med FROM public.medicoes WHERE id = _medicao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Medição não encontrada'; END IF;
  IF v_med.status::text NOT IN ('rascunho','importada','rejeitada') THEN
    RAISE EXCEPTION 'Medição em status % não permite aplicação de regras (apenas simulação)', v_med.status;
  END IF;
  SELECT * INTO v_contrato FROM public.contratos WHERE id = v_med.contrato_id;
  SELECT * INTO v_cliente FROM public.clientes WHERE id = v_contrato.cliente_id;

  FOR it IN SELECT * FROM public.medicao_itens WHERE medicao_id = _medicao_id LOOP
    SELECT * INTO v_eq FROM public.equipamentos WHERE id = it.equipamento_id;
    calc := public._calc_item_com_regras(it.id);
    novos := calc->'novos';
    v_old_final := it.valor_final;

    UPDATE public.medicao_itens SET
      valor_hora = (novos->>'valor_hora')::numeric,
      garantia_minima = (novos->>'garantia_minima')::numeric,
      horas_liquidas = (novos->>'horas_liquidas')::numeric,
      horas_a_pagar = (novos->>'horas_a_pagar')::numeric,
      valor_bruto = (novos->>'valor_bruto')::numeric,
      valor_complementares = (novos->>'valor_complementares')::numeric,
      valor_descontos = (novos->>'valor_descontos')::numeric,
      valor_final = (novos->>'valor_final')::numeric,
      regras_aplicadas = calc->'regras_aplicadas',
      updated_at = now()
    WHERE id = it.id;

    INSERT INTO public.medicao_item_alteracoes(
      medicao_id, medicao_item_id, contrato_id, cliente_id, cliente_nome, contrato_numero,
      competencia, equipamento_id, equipamento_serie, equipamento_tag,
      user_id, user_email, perfil_usuario, acao, campo, valor_anterior, valor_novo, motivo
    ) VALUES (
      v_med.id, it.id, v_contrato.id, v_cliente.id, v_cliente.razao_social, v_contrato.numero_dj,
      v_med.competencia, v_eq.id, v_eq.serie, v_eq.tag,
      v_uid, v_email, v_role, 'APLICAR_REGRAS',
      'valor_final', v_old_final::text, (novos->>'valor_final'),
      _motivo
    );
    n := n + 1;
  END LOOP;

  PERFORM public._recalc_medicao_totais(_medicao_id);

  INSERT INTO public.medicao_item_alteracoes(
    medicao_id, contrato_id, cliente_id, cliente_nome, contrato_numero,
    competencia, user_id, user_email, perfil_usuario, acao, campo,
    valor_anterior, valor_novo, motivo
  ) VALUES (
    _medicao_id, v_contrato.id, v_cliente.id, v_cliente.razao_social, v_contrato.numero_dj,
    v_med.competencia, v_uid, v_email, v_role, 'APLICAR_REGRAS_MEDICAO', NULL,
    NULL, n::text || ' itens recalculados pelas regras', _motivo
  );

  RETURN jsonb_build_object('ok', true, 'itens', n);
END; $$;
