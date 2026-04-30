UPDATE public.medicao_itens AS mi
SET regras_aplicadas = COALESCE(mi.regras_aplicadas, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'tipo', 'm3_importacao',
    'origem', 'importacao',
    'descricao', 'Valores calculados pela planilha M3 (Controle de Horímetros Obras Ápia) — backfill',
    'tipo_pagamento', CASE
      WHEN mi.horas_a_pagar = mi.garantia_minima AND mi.garantia_minima > COALESCE(mi.horas_liquidas, 0)
        THEN 'H.G.'
      ELSE 'H.T.'
    END,
    'garantia_aplicada', mi.garantia_minima,
    'ht_informado', mi.horas_informadas,
    'horas_mecanicas', mi.horas_mecanicas,
    'horas_pagar_bruto', mi.horas_a_pagar,
    'horas_pagar_liquido', mi.horas_a_pagar,
    'valor_hora', mi.valor_hora,
    'valor_final_planilha', mi.valor_final
  )
)
WHERE mi.medicao_id = 'dd66a97c-ee86-414a-a96c-7a50c74286f9'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(mi.regras_aplicadas, '[]'::jsonb)) r
    WHERE r->>'tipo' = 'm3_importacao'
  );