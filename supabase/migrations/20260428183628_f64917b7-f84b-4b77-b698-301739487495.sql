-- 1) Coluna tipo_equipamento
ALTER TABLE public.contrato_regras
  ADD COLUMN IF NOT EXISTS tipo_equipamento text;

-- 2) Função de normalização (sem acento, minúsculo, espaços colapsados)
CREATE OR REPLACE FUNCTION public._norm_tipo_eq(_t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(
    lower(translate(coalesce(_t,''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')),
    '\s+', ' ', 'g'
  )
$function$;

-- 3) Índice único parcial: impede duas regras ativas com mesmo tipo+escopo+vigência_inicio
DROP INDEX IF EXISTS public.uniq_contrato_regra_escopo;
CREATE UNIQUE INDEX uniq_contrato_regra_escopo
  ON public.contrato_regras (
    contrato_id,
    tipo,
    vigencia_inicio,
    COALESCE(equipamento_id::text, ''),
    COALESCE(public._norm_tipo_eq(tipo_equipamento), '')
  )
  WHERE ativa = true;

-- 4) _regra_vigente: prioriza equipamento > tipo de equipamento > geral
DROP FUNCTION IF EXISTS public._regra_vigente(uuid, uuid, regra_tipo, date, date);
CREATE OR REPLACE FUNCTION public._regra_vigente(_contrato_id uuid, _equipamento_id uuid, _tipo_equipamento text, _tipo regra_tipo, _periodo_inicio date, _periodo_fim date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(r.*)
  FROM public.contrato_regras r
  WHERE r.contrato_id = _contrato_id
    AND r.tipo = _tipo
    AND r.ativa = true
    AND (
      r.equipamento_id = _equipamento_id
      OR (r.equipamento_id IS NULL AND r.tipo_equipamento IS NOT NULL
          AND public._norm_tipo_eq(r.tipo_equipamento) = public._norm_tipo_eq(_tipo_equipamento))
      OR (r.equipamento_id IS NULL AND r.tipo_equipamento IS NULL)
    )
    AND r.vigencia_inicio <= _periodo_fim
    AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= _periodo_inicio)
  ORDER BY
    (r.equipamento_id = _equipamento_id) DESC,
    (r.equipamento_id IS NULL AND r.tipo_equipamento IS NOT NULL) DESC,
    r.vigencia_inicio DESC
  LIMIT 1;
$function$;

-- 5) _calc_item_com_regras: usa tipo do equipamento e novo escopo
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
  SELECT * INTO eq FROM public.equipamentos WHERE id = it.equipamento_id;
  eqid := it.equipamento_id;
  tipo_eq := eq.tipo;
  p_ini := COALESCE(it.periodo_inicio, med.periodo_inicio, med.competencia);
  p_fim := COALESCE(it.periodo_fim, med.periodo_fim, med.competencia);

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
    v_garantia := COALESCE((r_gar->'parametros'->>'horas')::numeric, it.garantia_minima);
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','garantia_minima',
      'origem', CASE
        WHEN (r_gar->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_gar->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_gar->>'tipo_equipamento',
      'horas', v_garantia,'regra_id', r_gar->>'id');
  ELSE
    v_garantia := it.garantia_minima;
  END IF;

  IF r_mec IS NOT NULL THEN
    desconta_mec := COALESCE((r_mec->'parametros'->>'aplicar')::boolean, true);
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','desconto_horas_mecanicas',
      'origem', CASE
        WHEN (r_mec->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_mec->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_mec->>'tipo_equipamento',
      'aplicar', desconta_mec,'regra_id', r_mec->>'id');
  END IF;
  v_horas_mec := CASE WHEN desconta_mec THEN it.horas_mecanicas ELSE 0 END;

  IF r_chuv IS NOT NULL THEN
    modo_chuvoso := COALESCE(r_chuv->'parametros'->>'modo','normal');
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','periodo_chuvoso',
      'origem', CASE
        WHEN (r_chuv->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_chuv->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_chuv->>'tipo_equipamento',
      'modo', modo_chuvoso,'regra_id', r_chuv->>'id');
  END IF;
  IF r_exc IS NOT NULL AND it.horas_excecao_chuvoso > 0 THEN
    modo_chuvoso := 'normal';
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','excecao_chuvoso',
      'origem', CASE
        WHEN (r_exc->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_exc->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_exc->>'tipo_equipamento',
      'modo','normal','regra_id', r_exc->>'id');
  END IF;

  v_horas_liq := GREATEST(0, it.horas_informadas - v_horas_mec);
  IF modo_chuvoso IN ('somente_informadas','sem_garantia') THEN
    v_horas_pagar := v_horas_liq;
  ELSE
    v_horas_pagar := GREATEST(v_horas_liq, v_garantia);
  END IF;

  v_valor_bruto := v_horas_pagar * v_valor_hora;

  v_compl := COALESCE(it.valor_complementares, 0);
  IF r_compl IS NOT NULL THEN
    v_compl := COALESCE((r_compl->'parametros'->>'valor_fixo')::numeric, 0)
             + COALESCE((r_compl->'parametros'->>'percentual')::numeric, 0) * v_valor_bruto / 100;
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','complementar',
      'origem', CASE
        WHEN (r_compl->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_compl->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_compl->>'tipo_equipamento',
      'valor', v_compl,'regra_id', r_compl->>'id');
  END IF;

  v_desc := COALESCE(it.valor_descontos, 0);
  IF r_dm IS NOT NULL THEN
    v_desc := COALESCE((r_dm->'parametros'->>'valor_fixo')::numeric, 0)
            + COALESCE((r_dm->'parametros'->>'percentual')::numeric, 0) * v_valor_bruto / 100;
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','desconto_manual',
      'origem', CASE
        WHEN (r_dm->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_dm->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_dm->>'tipo_equipamento',
      'valor', v_desc,'regra_id', r_dm->>'id');
  END IF;

  IF r_pers IS NOT NULL THEN
    aplicadas := aplicadas || jsonb_build_object(
      'tipo','regra_personalizada',
      'origem', CASE
        WHEN (r_pers->>'equipamento_id') IS NOT NULL THEN 'equipamento'
        WHEN (r_pers->>'tipo_equipamento') IS NOT NULL THEN 'tipo_equipamento'
        ELSE 'contrato' END,
      'tipo_equipamento', r_pers->>'tipo_equipamento',
      'nome', r_pers->'parametros'->>'nome',
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
END; $function$;

-- 6) simular_regras_medicao com novas estatísticas (gerais/tipo/equipamento)
CREATE OR REPLACE FUNCTION public.simular_regras_medicao(_medicao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  it record; res jsonb := '[]'::jsonb; calc jsonb; enriched jsonb;
  v_eq record;
  total_atual numeric := 0; total_novo numeric := 0;
  v_med record; v_ctr record;
  v_total_regras int := 0;
  v_regras_aplicaveis int := 0;
  v_regras_geral int := 0;
  v_regras_tipo int := 0;
  v_regras_eq int := 0;
  v_eq_afetados int := 0;
  v_eq_nao_afetados int := 0;
  v_alertas jsonb := '[]'::jsonb;
  r record; eq_match_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_med FROM public.medicoes WHERE id = _medicao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Medição não encontrada'; END IF;
  SELECT * INTO v_ctr FROM public.contratos WHERE id = v_med.contrato_id;

  SELECT count(*) INTO v_total_regras FROM public.contrato_regras
    WHERE contrato_id = v_ctr.id AND ativa = true;

  SELECT
    count(*) FILTER (WHERE TRUE),
    count(*) FILTER (WHERE equipamento_id IS NULL AND tipo_equipamento IS NULL),
    count(*) FILTER (WHERE equipamento_id IS NULL AND tipo_equipamento IS NOT NULL),
    count(*) FILTER (WHERE equipamento_id IS NOT NULL)
  INTO v_regras_aplicaveis, v_regras_geral, v_regras_tipo, v_regras_eq
  FROM public.contrato_regras
  WHERE contrato_id = v_ctr.id AND ativa = true
    AND vigencia_inicio <= COALESCE(v_med.periodo_fim, v_med.competencia)
    AND (vigencia_fim IS NULL OR vigencia_fim >= COALESCE(v_med.periodo_inicio, v_med.competencia));

  -- Alertas: regras específicas de equipamento sem item correspondente
  FOR r IN
    SELECT cr.*, e.serie AS eq_serie, e.tag AS eq_tag
    FROM public.contrato_regras cr
    LEFT JOIN public.equipamentos e ON e.id = cr.equipamento_id
    WHERE cr.contrato_id = v_ctr.id AND cr.ativa = true AND cr.equipamento_id IS NOT NULL
      AND cr.vigencia_inicio <= COALESCE(v_med.periodo_fim, v_med.competencia)
      AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= COALESCE(v_med.periodo_inicio, v_med.competencia))
  LOOP
    SELECT count(*) INTO eq_match_count FROM public.medicao_itens
      WHERE medicao_id = _medicao_id AND equipamento_id = r.equipamento_id;
    IF eq_match_count = 0 THEN
      v_alertas := v_alertas || jsonb_build_object(
        'tipo','regra_sem_equipamento','regra_id', r.id, 'regra_tipo', r.tipo,
        'equipamento_serie', r.eq_serie, 'equipamento_tag', r.eq_tag,
        'mensagem','Regra específica não encontrou equipamento correspondente nesta medição.');
    END IF;
  END LOOP;

  -- Alertas: regras por tipo de equipamento sem item correspondente
  FOR r IN
    SELECT cr.*
    FROM public.contrato_regras cr
    WHERE cr.contrato_id = v_ctr.id AND cr.ativa = true
      AND cr.equipamento_id IS NULL AND cr.tipo_equipamento IS NOT NULL
      AND cr.vigencia_inicio <= COALESCE(v_med.periodo_fim, v_med.competencia)
      AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= COALESCE(v_med.periodo_inicio, v_med.competencia))
  LOOP
    SELECT count(*) INTO eq_match_count
    FROM public.medicao_itens mi
    JOIN public.equipamentos e ON e.id = mi.equipamento_id
    WHERE mi.medicao_id = _medicao_id
      AND public._norm_tipo_eq(e.tipo) = public._norm_tipo_eq(r.tipo_equipamento);
    IF eq_match_count = 0 THEN
      v_alertas := v_alertas || jsonb_build_object(
        'tipo','regra_sem_tipo','regra_id', r.id, 'regra_tipo', r.tipo,
        'tipo_equipamento', r.tipo_equipamento,
        'mensagem','Regra por tipo de equipamento não encontrou equipamento correspondente nesta medição.');
    END IF;
  END LOOP;

  FOR it IN SELECT id, equipamento_id FROM public.medicao_itens WHERE medicao_id = _medicao_id LOOP
    calc := public._calc_item_com_regras(it.id);
    SELECT serie, tag, tipo, modelo INTO v_eq FROM public.equipamentos WHERE id = it.equipamento_id;
    enriched := calc || jsonb_build_object(
      'equipamento_serie', v_eq.serie,
      'equipamento_tag', v_eq.tag,
      'equipamento_tipo', v_eq.tipo,
      'equipamento_modelo', v_eq.modelo
    );
    res := res || jsonb_build_array(enriched);
    total_atual := total_atual + COALESCE((calc->>'valor_atual')::numeric, 0);
    total_novo  := total_novo + COALESCE((calc->>'valor_recalculado')::numeric, 0);
    IF abs(COALESCE((calc->>'diferenca')::numeric, 0)) > 0.01 THEN
      v_eq_afetados := v_eq_afetados + 1;
    ELSE
      v_eq_nao_afetados := v_eq_nao_afetados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'medicao_id', _medicao_id,
    'periodo_inicio', v_med.periodo_inicio,
    'periodo_fim', v_med.periodo_fim,
    'total_atual', total_atual,
    'total_recalculado', total_novo,
    'diferenca', total_novo - total_atual,
    'itens', res,
    'estatisticas', jsonb_build_object(
      'total_regras', v_total_regras,
      'regras_aplicaveis', v_regras_aplicaveis,
      'regras_gerais', v_regras_geral,
      'regras_por_tipo', v_regras_tipo,
      'regras_por_equipamento', v_regras_eq,
      'equipamentos_afetados', v_eq_afetados,
      'equipamentos_nao_afetados', v_eq_nao_afetados
    ),
    'alertas', v_alertas
  );
END; $function$;