
DROP POLICY IF EXISTS p_mia_insert_authenticated ON public.medicao_item_alteracoes;
CREATE POLICY p_mia_insert_authenticated ON public.medicao_item_alteracoes
FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'gestor_contrato'::app_role, 'operacional'::app_role]));

REVOKE EXECUTE ON FUNCTION public.update_medicao_item(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.recalcular_medicao(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public._log_item_change(uuid, record, record, record, record, record, uuid, text, text, text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public._recalc_medicao_totais(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.update_medicao_item(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_medicao(uuid, text) TO authenticated;
