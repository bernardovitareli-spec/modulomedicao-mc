-- 1. Adicionar base de dias para garantia no contrato
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS base_dias_garantia integer NOT NULL DEFAULT 30;

-- 2. Adicionar campos de proporcionalidade no item da medição
ALTER TABLE public.medicao_itens
  ADD COLUMN IF NOT EXISTS data_inicio_operacao_item date,
  ADD COLUMN IF NOT EXISTS data_fim_operacao_item date,
  ADD COLUMN IF NOT EXISTS dias_considerados integer,
  ADD COLUMN IF NOT EXISTS garantia_mensal_horas numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS garantia_proporcional_horas numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aplicar_garantia_proporcional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_proporcionalidade text;

-- 3. Função utilitária: calcula proporcionalidade do item
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
  IF _data_fim_op IS NOT NULL AND _data_fim_op < _periodo_inicio THEN
    v_erro := 'Data de fim do equipamento anterior ao início da medição.';
  ELSIF _data_inicio_op IS NOT NULL AND _data_inicio_op > _periodo_fim THEN
    v_erro := 'Data de início do equipamento posterior ao fim da medição.';
  ELSIF v_ini > v_fim THEN
    v_erro := 'Data de início do equipamento maior que a data fim.';
  END IF;

  v_dias := GREATEST(0, (v_fim - v_ini) + 1);
  v_proporcional := (v_ini > _periodo_inicio) OR (v_fim < _periodo_fim);

  IF v_proporcional THEN
    v_garantia_prop := ROUND((COALESCE(_garantia_mensal,0) / v_base) * v_dias, 2);
  ELSE
    v_garantia_prop := COALESCE(_garantia_mensal,0);
  END IF;

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

-- 4. Atualizar _calc_item_com_regras para considerar garantia proporcional
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
  v_base_dias := COALESCE(ctr.base_dias_garantia, 30);

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
    v_garantia_mensal := COALESCE((r_gar->'parametros'->>'horas')::numeric, it.garantia_mensal_horas, it.garantia_minima);
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','garantia_minima',
      'origem', CASE
        WHEN (r_gar->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_gar->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_gar->>'tipo_equipamento',
      'horas', v_garantia_mensal,'regra_id', r_gar->>'id');
  ELSE
    v_garantia_mensal := COALESCE(NULLIF(it.garantia_mensal_horas,0), it.garantia_minima, COALESCE(ctr.garantia_minima_horas,0));
  END IF;

  -- Proporcionalidade
  v_prop := public._calc_proporcionalidade_item(
    p_ini, p_fim,
    it.data_inicio_operacao_item, it.data_fim_operacao_item,
    v_garantia_mensal, v_base_dias
  );

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
      'data_inicio_operacao_item', (v_prop->>'data_inicio_efetiva')::date,
      'data_fim_operacao_item', (v_prop->>'data_fim_efetiva')::date,
      'horas_mecanicas_efetivas', v_horas_mec,
      'horas_liquidas', v_horas_liq, 'horas_a_pagar', v_horas_pagar,
      'valor_bruto', v_valor_bruto, 'valor_complementares', v_compl,
      'valor_descontos', v_desc, 'valor_final', v_final
    ),
    'regras_aplicadas', aplicadas
  );
END; $function$;

-- 5. Atualizar aplicar_regras_medicao para persistir os novos campos
CREATE OR REPLACE FUNCTION public.aplicar_regras_medicao(_medicao_id uuid, _motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      garantia_mensal_horas = (novos->>'garantia_mensal_horas')::numeric,
      garantia_proporcional_horas = (novos->>'garantia_proporcional_horas')::numeric,
      aplicar_garantia_proporcional = (novos->>'aplicar_garantia_proporcional')::boolean,
      dias_considerados = (novos->>'dias_considerados')::int,
      data_inicio_operacao_item = COALESCE(it.data_inicio_operacao_item, (novos->>'data_inicio_operacao_item')::date),
      data_fim_operacao_item = COALESCE(it.data_fim_operacao_item, (novos->>'data_fim_operacao_item')::date),
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
END; $function$;

-- 6. Atualizar update_medicao_item para aceitar datas de operação e motivo de proporcionalidade
CREATE OR REPLACE FUNCTION public.update_medicao_item(
  _item_id uuid, _motivo text,
  _horimetro_inicial numeric, _horimetro_final numeric,
  _horas_informadas numeric, _horas_mecanicas numeric,
  _horas_chuvoso numeric, _horas_excecao_chuvoso numeric,
  _valor_complementares numeric, _valor_descontos numeric,
  _observacoes text,
  _data_inicio_operacao_item date DEFAULT NULL,
  _data_fim_operacao_item date DEFAULT NULL,
  _motivo_proporcionalidade text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text; v_email text;
  v_old record; v_med record; v_contrato record; v_cliente record;
  v_eq record; v_ce record;
  v_valor_hora numeric;
  v_garantia_mensal numeric;
  v_garantia_efetiva numeric;
  v_horas_liquidas numeric; v_horas_a_pagar numeric;
  v_valor_bruto numeric; v_valor_final numeric;
  v_changes int := 0;
  v_calc_changed boolean := false;
  v_prop jsonb;
  v_base_dias integer;
  v_p_ini date; v_p_fim date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo da alteração é obrigatório (mínimo 5 caracteres)';
  END IF;

  v_role := public.get_primary_role(v_uid);
  IF v_role NOT IN ('admin','gestor_contrato','operacional') THEN
    RAISE EXCEPTION 'Sem permissão para editar itens';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_old FROM public.medicao_itens WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  SELECT * INTO v_med FROM public.medicoes WHERE id = v_old.medicao_id;
  IF v_med.status::text NOT IN ('rascunho','importada','revisao_tecnica','rejeitada') THEN
    RAISE EXCEPTION 'Medição em status % não permite edição', v_med.status;
  END IF;

  SELECT * INTO v_contrato FROM public.contratos WHERE id = v_med.contrato_id;
  SELECT * INTO v_cliente FROM public.clientes WHERE id = v_contrato.cliente_id;
  SELECT * INTO v_eq FROM public.equipamentos WHERE id = v_old.equipamento_id;
  SELECT * INTO v_ce FROM public.contrato_equipamentos WHERE id = v_old.contrato_equipamento_id;

  IF _horimetro_inicial < 0 THEN RAISE EXCEPTION 'Horímetro inicial não pode ser negativo'; END IF;
  IF _horimetro_final < _horimetro_inicial THEN RAISE EXCEPTION 'Horímetro final deve ser ≥ inicial'; END IF;
  IF _horas_informadas < 0 THEN RAISE EXCEPTION 'HT informado não pode ser negativo'; END IF;
  IF _horas_mecanicas < 0 THEN RAISE EXCEPTION 'Horas mecânicas não pode ser negativa'; END IF;

  v_p_ini := COALESCE(v_old.periodo_inicio, v_med.periodo_inicio);
  v_p_fim := COALESCE(v_old.periodo_fim, v_med.periodo_fim);
  v_base_dias := COALESCE(v_contrato.base_dias_garantia, 30);
  v_valor_hora := COALESCE(v_ce.valor_hora_override, v_contrato.valor_hora_padrao, v_old.valor_hora, 0);
  v_garantia_mensal := COALESCE(NULLIF(v_old.garantia_mensal_horas,0), v_contrato.garantia_minima_horas, v_old.garantia_minima, 0);

  v_prop := public._calc_proporcionalidade_item(
    v_p_ini, v_p_fim,
    _data_inicio_operacao_item, _data_fim_operacao_item,
    v_garantia_mensal, v_base_dias
  );

  IF (v_prop->>'erro') IS NOT NULL THEN
    RAISE EXCEPTION '%', v_prop->>'erro';
  END IF;

  v_garantia_efetiva := CASE WHEN (v_prop->>'aplicar_proporcional')::boolean
    THEN (v_prop->>'garantia_proporcional')::numeric
    ELSE v_garantia_mensal END;

  v_horas_liquidas := GREATEST(0, _horas_informadas - _horas_mecanicas);
  v_horas_a_pagar := GREATEST(v_horas_liquidas, v_garantia_efetiva);
  v_valor_bruto := v_horas_a_pagar * v_valor_hora;
  v_valor_final := v_valor_bruto + COALESCE(_valor_complementares,0) - COALESCE(_valor_descontos,0);

  IF v_valor_final < 0 THEN RAISE EXCEPTION 'Valor final não pode ser negativo'; END IF;

  -- Logs
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'horimetro_inicial', v_old.horimetro_inicial::text, _horimetro_inicial::text);
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'horimetro_final', v_old.horimetro_final::text, _horimetro_final::text);
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'horas_informadas', v_old.horas_informadas::text, _horas_informadas::text);
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'horas_mecanicas', v_old.horas_mecanicas::text, _horas_mecanicas::text);
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'horas_chuvoso', v_old.horas_chuvoso::text, _horas_chuvoso::text);
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'horas_excecao_chuvoso', v_old.horas_excecao_chuvoso::text, _horas_excecao_chuvoso::text);
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'valor_complementares', v_old.valor_complementares::text, _valor_complementares::text);
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'valor_descontos', v_old.valor_descontos::text, _valor_descontos::text);
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'observacoes', COALESCE(v_old.observacoes,''), COALESCE(_observacoes,''));
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'data_inicio_operacao_item', COALESCE(v_old.data_inicio_operacao_item::text,''), COALESCE(_data_inicio_operacao_item::text,''));
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'data_fim_operacao_item', COALESCE(v_old.data_fim_operacao_item::text,''), COALESCE(_data_fim_operacao_item::text,''));
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq, v_uid, v_email, v_role, _motivo,
    'motivo_proporcionalidade', COALESCE(v_old.motivo_proporcionalidade,''), COALESCE(_motivo_proporcionalidade,''));

  IF v_old.valor_final IS DISTINCT FROM v_valor_final
     OR v_old.horas_a_pagar IS DISTINCT FROM v_horas_a_pagar
     OR v_old.garantia_proporcional_horas IS DISTINCT FROM (v_prop->>'garantia_proporcional')::numeric THEN
    v_calc_changed := true;
  END IF;

  UPDATE public.medicao_itens SET
    horimetro_inicial = _horimetro_inicial,
    horimetro_final = _horimetro_final,
    horas_informadas = _horas_informadas,
    horas_mecanicas = _horas_mecanicas,
    horas_descontaveis = _horas_mecanicas,
    horas_chuvoso = _horas_chuvoso,
    horas_excecao_chuvoso = _horas_excecao_chuvoso,
    horas_liquidas = v_horas_liquidas,
    garantia_minima = v_garantia_efetiva,
    garantia_mensal_horas = v_garantia_mensal,
    garantia_proporcional_horas = (v_prop->>'garantia_proporcional')::numeric,
    aplicar_garantia_proporcional = (v_prop->>'aplicar_proporcional')::boolean,
    dias_considerados = (v_prop->>'dias_considerados')::int,
    data_inicio_operacao_item = _data_inicio_operacao_item,
    data_fim_operacao_item = _data_fim_operacao_item,
    motivo_proporcionalidade = NULLIF(_motivo_proporcionalidade,''),
    horas_a_pagar = v_horas_a_pagar,
    valor_hora = v_valor_hora,
    valor_bruto = v_valor_bruto,
    valor_complementares = COALESCE(_valor_complementares,0),
    valor_descontos = COALESCE(_valor_descontos,0),
    valor_final = v_valor_final,
    observacoes = NULLIF(_observacoes,''),
    updated_at = now()
  WHERE id = _item_id;

  IF v_calc_changed THEN
    INSERT INTO public.medicao_item_alteracoes(
      medicao_id, medicao_item_id, contrato_id, cliente_id, cliente_nome, contrato_numero,
      competencia, equipamento_id, equipamento_serie, equipamento_tag,
      user_id, user_email, perfil_usuario, acao, campo, valor_anterior, valor_novo, motivo
    ) VALUES (
      v_med.id, _item_id, v_contrato.id, v_cliente.id, v_cliente.razao_social, v_contrato.numero_dj,
      v_med.competencia, v_eq.id, v_eq.serie, v_eq.tag,
      v_uid, v_email, v_role, 'RECALCULO_AUTOMATICO',
      'valor_final', v_old.valor_final::text, v_valor_final::text,
      'Recálculo automático (incl. garantia proporcional) em consequência da edição'
    );
  END IF;

  PERFORM public._recalc_medicao_totais(v_med.id);

  RETURN jsonb_build_object('ok', true, 'changes', v_changes, 'recalculated', v_calc_changed,
    'proporcionalidade', v_prop);
END;
$function$;