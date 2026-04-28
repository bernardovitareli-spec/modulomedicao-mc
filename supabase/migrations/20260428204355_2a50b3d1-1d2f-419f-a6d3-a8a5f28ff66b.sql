
-- 1. Corrigir _calc_proporcionalidade_item para preservar precisão completa
CREATE OR REPLACE FUNCTION public._calc_proporcionalidade_item(
  _periodo_inicio date, _periodo_fim date,
  _data_inicio_op date, _data_fim_op date,
  _garantia_mensal numeric, _base_dias integer
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
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

  -- Precisão completa: NÃO arredondar aqui. Arredondamento apenas na exibição.
  IF v_proporcional THEN
    v_garantia_prop := COALESCE(_garantia_mensal,0) * v_dias::numeric / v_base::numeric;
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
$function$;

-- 2. Recalcular automaticamente todos os itens em rascunho/importada/rejeitada
--    para propagar a proporcionalidade aos totais.
DO $$
DECLARE
  m record;
  it record;
  calc jsonb;
  novos jsonb;
BEGIN
  FOR m IN SELECT id FROM public.medicoes WHERE status::text IN ('rascunho','importada','rejeitada') LOOP
    FOR it IN SELECT id FROM public.medicao_itens WHERE medicao_id = m.id LOOP
      calc := public._calc_item_com_regras(it.id);
      novos := calc->'novos';
      UPDATE public.medicao_itens SET
        valor_hora = (novos->>'valor_hora')::numeric,
        garantia_minima = (novos->>'garantia_minima')::numeric,
        garantia_mensal_horas = (novos->>'garantia_mensal_horas')::numeric,
        garantia_proporcional_horas = (novos->>'garantia_proporcional_horas')::numeric,
        aplicar_garantia_proporcional = (novos->>'aplicar_garantia_proporcional')::boolean,
        dias_considerados = (novos->>'dias_considerados')::int,
        horas_liquidas = (novos->>'horas_liquidas')::numeric,
        horas_a_pagar = (novos->>'horas_a_pagar')::numeric,
        valor_bruto = (novos->>'valor_bruto')::numeric,
        valor_complementares = (novos->>'valor_complementares')::numeric,
        valor_descontos = (novos->>'valor_descontos')::numeric,
        valor_final = (novos->>'valor_final')::numeric,
        regras_aplicadas = calc->'regras_aplicadas',
        updated_at = now()
      WHERE id = it.id;
    END LOOP;
    PERFORM public._recalc_medicao_totais(m.id);
  END LOOP;
END $$;
