CREATE OR REPLACE FUNCTION public._calc_proporcionalidade_item(
  _periodo_inicio date,
  _periodo_fim date,
  _data_inicio_op date,
  _data_fim_op date,
  _garantia_mensal numeric,
  _base_dias integer
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_ini date := COALESCE(_data_inicio_op, _periodo_inicio);
  v_fim date := COALESCE(_data_fim_op, _periodo_fim);
  v_dias integer;
  v_proporcional boolean;
  v_garantia_prop numeric;
  v_base integer := COALESCE(NULLIF(_base_dias,0), 30);
  v_erro text := NULL;
BEGIN
  IF _periodo_inicio IS NULL OR _periodo_fim IS NULL THEN
    v_erro := 'Período da medição não informado.';
  ELSIF _data_fim_op IS NOT NULL AND _data_fim_op < _periodo_inicio THEN
    v_erro := 'Data de fim do equipamento anterior ao início da medição.';
  ELSIF _data_inicio_op IS NOT NULL AND _data_inicio_op > _periodo_fim THEN
    v_erro := 'Data de início do equipamento posterior ao fim da medição.';
  ELSIF v_ini > v_fim THEN
    v_erro := 'Data de início do equipamento maior que a data fim.';
  END IF;

  v_dias := GREATEST(0, (v_fim - v_ini) + 1);
  v_proporcional := v_dias < v_base;
  v_garantia_prop := ROUND((COALESCE(_garantia_mensal,0) / v_base) * v_dias, 2);

  RETURN jsonb_build_object(
    'data_inicio_efetiva', v_ini,
    'data_fim_efetiva', v_fim,
    'dias_considerados', v_dias,
    'aplicar_proporcional', v_proporcional,
    'garantia_proporcional', v_garantia_prop,
    'base_dias', v_base,
    'erro', v_erro
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._calc_item_com_regras(_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  it record; med record; ctr record; eq record; eqid uuid; tipo_eq text;
  p_ini date; p_fim date;
  r_vh jsonb; r_gar jsonb; r_mec jsonb; r_chuv jsonb; r_exc jsonb;
  r_dm jsonb; r_compl jsonb; r_pers jsonb;
  v_valor_hora numeric; v_garantia_mensal numeric; v_garantia_efetiva numeric;
  v_horas_mec numeric; v_horas_liq numeric; v_horas_pagar numeric;
  v_valor_bruto numeric; v_compl numeric; v_desc numeric; v_final numeric;
  aplicadas jsonb := '[]'::jsonb;
  desconta_mec boolean := true;
  modo_chuvoso text := 'normal';
  v_prop jsonb;
  v_base_dias integer;
BEGIN
  SELECT * INTO it FROM public.medicao_itens WHERE id = _item_id;
  SELECT * INTO med FROM public.medicoes WHERE id = it.medicao_id;
  SELECT * INTO ctr FROM public.contratos WHERE id = med.contrato_id;
  SELECT * INTO eq FROM public.equipamentos WHERE id = it.equipamento_id;
  eqid := it.equipamento_id;
  tipo_eq := eq.tipo;
  p_ini := COALESCE(it.periodo_inicio, med.periodo_inicio, med.competencia);
  p_fim := COALESCE(it.periodo_fim, med.periodo_fim, med.competencia);
  v_base_dias := COALESCE(NULLIF(ctr.base_dias_garantia,0), 30);

  r_vh    := public._regra_vigente(ctr.id, eqid, tipo_eq, 'valor_hora', p_ini, p_fim);
  r_gar   := public._regra_vigente(ctr.id, eqid, tipo_eq, 'garantia_minima', p_ini, p_fim);
  r_mec   := public._regra_vigente(ctr.id, eqid, tipo_eq, 'desconto_horas_mecanicas', p_ini, p_fim);
  r_chuv  := public._regra_vigente(ctr.id, eqid, tipo_eq, 'periodo_chuvoso', p_ini, p_fim);
  r_exc   := public._regra_vigente(ctr.id, eqid, tipo_eq, 'excecao_chuvoso', p_ini, p_fim);
  r_dm    := public._regra_vigente(ctr.id, eqid, tipo_eq, 'desconto_manual', p_ini, p_fim);
  r_compl := public._regra_vigente(ctr.id, eqid, tipo_eq, 'complementar', p_ini, p_fim);
  r_pers  := public._regra_vigente(ctr.id, eqid, tipo_eq, 'regra_personalizada', p_ini, p_fim);

  IF r_vh IS NOT NULL THEN
    v_valor_hora := COALESCE((r_vh->'parametros'->>'valor')::numeric, it.valor_hora);
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','valor_hora',
      'origem', CASE
        WHEN (r_vh->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_vh->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_vh->>'tipo_equipamento',
      'valor', v_valor_hora,'regra_id', r_vh->>'id');
  ELSE
    v_valor_hora := it.valor_hora;
  END IF;

  IF r_gar IS NOT NULL THEN
    v_garantia_mensal := COALESCE((r_gar->'parametros'->>'horas')::numeric, NULLIF(it.garantia_mensal_horas,0), it.garantia_minima, ctr.garantia_minima_horas, 0);
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','garantia_minima',
      'origem', CASE
        WHEN (r_gar->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_gar->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_gar->>'tipo_equipamento',
      'horas', v_garantia_mensal,'regra_id', r_gar->>'id');
  ELSE
    v_garantia_mensal := COALESCE(NULLIF(it.garantia_mensal_horas,0), ctr.garantia_minima_horas, it.garantia_minima, 0);
  END IF;

  v_prop := public._calc_proporcionalidade_item(
    p_ini, p_fim,
    it.data_inicio_operacao_item, it.data_fim_operacao_item,
    v_garantia_mensal, v_base_dias
  );

  IF (v_prop->>'erro') IS NOT NULL THEN
    RAISE EXCEPTION '%', v_prop->>'erro';
  END IF;

  IF (v_prop->>'aplicar_proporcional')::boolean THEN
    v_garantia_efetiva := (v_prop->>'garantia_proporcional')::numeric;
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','garantia_proporcional',
      'origem','automatica',
      'dias_considerados', (v_prop->>'dias_considerados')::int,
      'base_dias', v_base_dias,
      'garantia_mensal', v_garantia_mensal,
      'garantia_proporcional', v_garantia_efetiva
    );
  ELSE
    v_garantia_efetiva := v_garantia_mensal;
  END IF;

  IF r_mec IS NOT NULL THEN
    desconta_mec := COALESCE((r_mec->'parametros'->>'aplicar')::boolean, true);
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','desconto_horas_mecanicas','origem','contrato',
      'aplicar', desconta_mec,'regra_id', r_mec->>'id');
  END IF;
  v_horas_mec := CASE WHEN desconta_mec THEN it.horas_mecanicas ELSE 0 END;

  IF r_chuv IS NOT NULL THEN
    modo_chuvoso := COALESCE(r_chuv->'parametros'->>'modo','normal');
  END IF;
  IF r_exc IS NOT NULL AND it.horas_excecao_chuvoso > 0 THEN
    modo_chuvoso := 'normal';
  END IF;

  v_horas_liq := GREATEST(0, it.horas_informadas - v_horas_mec);
  IF modo_chuvoso IN ('somente_informadas','sem_garantia') THEN
    v_horas_pagar := v_horas_liq;
  ELSE
    v_horas_pagar := GREATEST(v_horas_liq, v_garantia_efetiva);
  END IF;

  v_valor_bruto := v_horas_pagar * v_valor_hora;

  v_compl := COALESCE(it.valor_complementares, 0);
  IF r_compl IS NOT NULL THEN
    v_compl := COALESCE((r_compl->'parametros'->>'valor_fixo')::numeric, 0)
             + COALESCE((r_compl->'parametros'->>'percentual')::numeric, 0) * v_valor_bruto / 100;
    aplicadas := aplicadas || jsonb_build_object('tipo','complementar','valor', v_compl,'regra_id', r_compl->>'id');
  END IF;

  v_desc := COALESCE(it.valor_descontos, 0);
  IF r_dm IS NOT NULL THEN
    v_desc := COALESCE((r_dm->'parametros'->>'valor_fixo')::numeric, 0)
            + COALESCE((r_dm->'parametros'->>'percentual')::numeric, 0) * v_valor_bruto / 100;
    aplicadas := aplicadas || jsonb_build_object('tipo','desconto_manual','valor', v_desc,'regra_id', r_dm->>'id');
  END IF;

  IF r_pers IS NOT NULL THEN
    aplicadas := aplicadas || jsonb_build_object('tipo','regra_personalizada','nome', r_pers->'parametros'->>'nome','regra_id', r_pers->>'id');
  END IF;

  v_final := v_valor_bruto + v_compl - v_desc;
  IF v_final < 0 THEN v_final := 0; END IF;

  RETURN jsonb_build_object(
    'item_id', it.id,
    'equipamento_id', it.equipamento_id,
    'valor_atual', it.valor_final,
    'valor_recalculado', v_final,
    'diferenca', v_final - it.valor_final,
    'proporcionalidade', v_prop,
    'novos', jsonb_build_object(
      'valor_hora', v_valor_hora,
      'garantia_mensal_horas', v_garantia_mensal,
      'garantia_proporcional_horas', (v_prop->>'garantia_proporcional')::numeric,
      'garantia_minima', v_garantia_efetiva,
      'aplicar_garantia_proporcional', (v_prop->>'aplicar_proporcional')::boolean,
      'dias_considerados', (v_prop->>'dias_considerados')::int,
      'base_dias_garantia', v_base_dias,
      'data_inicio_considerada', (v_prop->>'data_inicio_efetiva')::date,
      'data_fim_considerada', (v_prop->>'data_fim_efetiva')::date,
      'horas_mecanicas_efetivas', v_horas_mec,
      'horas_liquidas', v_horas_liq, 'horas_a_pagar', v_horas_pagar,
      'valor_bruto', v_valor_bruto, 'valor_complementares', v_compl,
      'valor_descontos', v_desc, 'valor_final', v_final
    ),
    'regras_aplicadas', aplicadas
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.recalcular_medicao(_medicao_id uuid, _motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_email text;
  v_med record;
  v_contrato record;
  v_cliente record;
  it record;
  v_eq record;
  calc jsonb;
  novos jsonb;
  v_count int := 0;
  v_prop_count int := 0;
  v_motivo_hist text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo do recálculo é obrigatório (mínimo 5 caracteres)';
  END IF;
  v_role := public.get_primary_role(v_uid);
  IF v_role NOT IN ('admin','gestor_contrato','operacional') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_med FROM public.medicoes WHERE id = _medicao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Medição não encontrada'; END IF;
  IF v_med.status::text NOT IN ('rascunho','importada','rejeitada') THEN
    RAISE EXCEPTION 'Medição em status % não permite recálculo (apenas simulação)', v_med.status;
  END IF;

  SELECT * INTO v_contrato FROM public.contratos WHERE id = v_med.contrato_id;
  SELECT * INTO v_cliente FROM public.clientes WHERE id = v_contrato.cliente_id;

  FOR it IN SELECT * FROM public.medicao_itens WHERE medicao_id = _medicao_id LOOP
    SELECT * INTO v_eq FROM public.equipamentos WHERE id = it.equipamento_id;
    calc := public._calc_item_com_regras(it.id);
    novos := calc->'novos';

    UPDATE public.medicao_itens SET
      valor_hora = (novos->>'valor_hora')::numeric,
      garantia_minima = (novos->>'garantia_minima')::numeric,
      garantia_mensal_horas = (novos->>'garantia_mensal_horas')::numeric,
      garantia_proporcional_horas = (novos->>'garantia_proporcional_horas')::numeric,
      aplicar_garantia_proporcional = (novos->>'aplicar_garantia_proporcional')::boolean,
      dias_considerados = (novos->>'dias_considerados')::int,
      horas_descontaveis = (novos->>'horas_mecanicas_efetivas')::numeric,
      horas_liquidas = (novos->>'horas_liquidas')::numeric,
      horas_a_pagar = (novos->>'horas_a_pagar')::numeric,
      valor_bruto = (novos->>'valor_bruto')::numeric,
      valor_complementares = (novos->>'valor_complementares')::numeric,
      valor_descontos = (novos->>'valor_descontos')::numeric,
      valor_final = (novos->>'valor_final')::numeric,
      regras_aplicadas = calc->'regras_aplicadas',
      updated_at = now()
    WHERE id = it.id;

    IF (novos->>'aplicar_garantia_proporcional')::boolean
       AND (
         COALESCE(it.aplicar_garantia_proporcional,false) = false
         OR it.garantia_minima IS DISTINCT FROM (novos->>'garantia_minima')::numeric
         OR it.horas_a_pagar IS DISTINCT FROM (novos->>'horas_a_pagar')::numeric
         OR it.valor_final IS DISTINCT FROM (novos->>'valor_final')::numeric
       ) THEN
      v_motivo_hist := 'Aplicação de proporcionalidade por período inferior a 30 dias';
      INSERT INTO public.medicao_item_alteracoes(
        medicao_id, medicao_item_id, contrato_id, cliente_id, cliente_nome, contrato_numero,
        competencia, equipamento_id, equipamento_serie, equipamento_tag,
        user_id, user_email, perfil_usuario, acao, campo, valor_anterior, valor_novo, motivo
      ) VALUES (
        v_med.id, it.id, v_contrato.id, v_cliente.id, v_cliente.razao_social, v_contrato.numero_dj,
        v_med.competencia, v_eq.id, v_eq.serie, v_eq.tag,
        v_uid, v_email, v_role, 'RECALCULO_PROPORCIONALIDADE',
        'garantia_proporcional',
        jsonb_build_object(
          'garantia_mensal_anterior', it.garantia_minima,
          'horas_a_pagar_anterior', it.horas_a_pagar,
          'valor_anterior', it.valor_final
        )::text,
        jsonb_build_object(
          'dias_considerados', (novos->>'dias_considerados')::int,
          'base_dias_garantia', (novos->>'base_dias_garantia')::int,
          'garantia_mensal', (novos->>'garantia_mensal_horas')::numeric,
          'garantia_proporcional_nova', (novos->>'garantia_proporcional_horas')::numeric,
          'horas_a_pagar_nova', (novos->>'horas_a_pagar')::numeric,
          'valor_novo', (novos->>'valor_final')::numeric
        )::text,
        v_motivo_hist
      );
      v_prop_count := v_prop_count + 1;
    END IF;

    IF it.valor_final IS DISTINCT FROM (novos->>'valor_final')::numeric
       OR it.horas_a_pagar IS DISTINCT FROM (novos->>'horas_a_pagar')::numeric
       OR it.horas_liquidas IS DISTINCT FROM (novos->>'horas_liquidas')::numeric THEN
      INSERT INTO public.medicao_item_alteracoes(
        medicao_id, medicao_item_id, contrato_id, cliente_id, cliente_nome, contrato_numero,
        competencia, equipamento_id, equipamento_serie, equipamento_tag,
        user_id, user_email, perfil_usuario, acao, campo, valor_anterior, valor_novo, motivo
      ) VALUES (
        v_med.id, it.id, v_contrato.id, v_cliente.id, v_cliente.razao_social, v_contrato.numero_dj,
        v_med.competencia, v_eq.id, v_eq.serie, v_eq.tag,
        v_uid, v_email, v_role, 'RECALCULO_MEDICAO',
        'valor_final', it.valor_final::text, (novos->>'valor_final'), _motivo
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  PERFORM public._recalc_medicao_totais(_medicao_id);

  INSERT INTO public.medicao_item_alteracoes(
    medicao_id, contrato_id, cliente_id, cliente_nome, contrato_numero,
    competencia, user_id, user_email, perfil_usuario, acao, campo,
    valor_anterior, valor_novo, motivo
  ) VALUES (
    _medicao_id, v_contrato.id, v_cliente.id, v_cliente.razao_social, v_contrato.numero_dj,
    v_med.competencia, v_uid, v_email, v_role, 'RECALCULO_MEDICAO', NULL,
    NULL, v_count::text || ' itens recalculados; ' || v_prop_count::text || ' com proporcionalidade', _motivo
  );

  RETURN jsonb_build_object('ok', true, 'itens', v_count, 'proporcionalidade', v_prop_count);
END; $function$;