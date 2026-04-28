CREATE OR REPLACE FUNCTION public._calc_proporcionalidade_item(
  _periodo_inicio date,
  _periodo_fim date,
  _data_inicio_op date,
  _data_fim_op date,
  _garantia_mensal numeric,
  _base_dias integer
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
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

REVOKE EXECUTE ON FUNCTION public._calc_proporcionalidade_item(date, date, date, date, numeric, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public._calc_proporcionalidade_item(date, date, date, date, numeric, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public._calc_item_com_regras(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public._calc_item_com_regras(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.recalcular_medicao(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.recalcular_medicao(uuid, text) TO authenticated;