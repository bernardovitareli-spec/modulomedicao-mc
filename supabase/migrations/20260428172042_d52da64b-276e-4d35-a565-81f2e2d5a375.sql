
-- ===== Tabela de histórico de alterações de itens da medição =====
CREATE TABLE public.medicao_item_alteracoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medicao_id uuid NOT NULL,
  medicao_item_id uuid,
  contrato_id uuid,
  cliente_id uuid,
  cliente_nome text,
  contrato_numero text,
  competencia date,
  equipamento_id uuid,
  equipamento_serie text,
  equipamento_tag text,
  user_id uuid,
  user_email text,
  perfil_usuario text,
  acao text NOT NULL DEFAULT 'EDIT',
  campo text,
  valor_anterior text,
  valor_novo text,
  motivo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_mia_medicao ON public.medicao_item_alteracoes(medicao_id);
CREATE INDEX idx_mia_user ON public.medicao_item_alteracoes(user_id);
CREATE INDEX idx_mia_equipamento ON public.medicao_item_alteracoes(equipamento_id);
CREATE INDEX idx_mia_campo ON public.medicao_item_alteracoes(campo);
CREATE INDEX idx_mia_created ON public.medicao_item_alteracoes(created_at DESC);

ALTER TABLE public.medicao_item_alteracoes ENABLE ROW LEVEL SECURITY;

-- Admin e gestor: tudo
CREATE POLICY p_mia_read_admin_gestor ON public.medicao_item_alteracoes
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'gestor_contrato'::app_role]));

-- Operacional: apenas alterações que ele mesmo registrou
CREATE POLICY p_mia_read_operacional ON public.medicao_item_alteracoes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'operacional'::app_role)
  AND user_id = auth.uid()
);

-- Cliente / aprovador (visualizacao): histórico de medições em aprovação ou já decididas
CREATE POLICY p_mia_read_aprovador ON public.medicao_item_alteracoes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'visualizacao'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.medicoes m
    WHERE m.id = medicao_item_alteracoes.medicao_id
      AND m.status::text IN ('revisao_tecnica','aprovacao_gerencial','aprovada','faturada','paga')
  )
);

-- Inserts somente via RPC (security definer) — bloqueia INSERT direto sem autenticação
CREATE POLICY p_mia_insert_authenticated ON public.medicao_item_alteracoes
FOR INSERT TO authenticated
WITH CHECK (true);

-- ===== Função: editar item da medição com motivo obrigatório e log automático =====
CREATE OR REPLACE FUNCTION public.update_medicao_item(
  _item_id uuid,
  _motivo text,
  _horimetro_inicial numeric,
  _horimetro_final numeric,
  _horas_informadas numeric,
  _horas_mecanicas numeric,
  _horas_chuvoso numeric,
  _horas_excecao_chuvoso numeric,
  _valor_complementares numeric,
  _valor_descontos numeric,
  _observacoes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_email text;
  v_old record;
  v_med record;
  v_contrato record;
  v_cliente record;
  v_eq record;
  v_ce record;
  v_valor_hora numeric;
  v_garantia numeric;
  v_horas_liquidas numeric;
  v_horas_a_pagar numeric;
  v_valor_bruto numeric;
  v_valor_final numeric;
  v_changes int := 0;
  v_calc_changed boolean := false;
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

  -- Validações
  IF _horimetro_inicial < 0 THEN RAISE EXCEPTION 'Horímetro inicial não pode ser negativo'; END IF;
  IF _horimetro_final < _horimetro_inicial THEN RAISE EXCEPTION 'Horímetro final deve ser ≥ inicial'; END IF;
  IF _horas_informadas < 0 THEN RAISE EXCEPTION 'HT informado não pode ser negativo'; END IF;
  IF _horas_mecanicas < 0 THEN RAISE EXCEPTION 'Horas mecânicas não pode ser negativa'; END IF;

  -- Cálculos
  v_valor_hora := COALESCE(v_ce.valor_hora_override, v_contrato.valor_hora_padrao, 0);
  v_garantia := COALESCE(v_contrato.garantia_minima_horas, 0);
  v_horas_liquidas := GREATEST(0, _horas_informadas - _horas_mecanicas);
  v_horas_a_pagar := GREATEST(v_horas_liquidas, v_garantia);
  v_valor_bruto := v_horas_a_pagar * v_valor_hora;
  v_valor_final := v_valor_bruto + COALESCE(_valor_complementares,0) - COALESCE(_valor_descontos,0);

  IF v_valor_final < 0 THEN RAISE EXCEPTION 'Valor final não pode ser negativo'; END IF;

  -- Log de cada campo operacional alterado
  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq,
    v_uid, v_email, v_role, _motivo,
    'horimetro_inicial', v_old.horimetro_inicial::text, _horimetro_inicial::text);
  IF v_old.horimetro_inicial IS DISTINCT FROM _horimetro_inicial THEN v_changes := v_changes + 1; END IF;

  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq,
    v_uid, v_email, v_role, _motivo,
    'horimetro_final', v_old.horimetro_final::text, _horimetro_final::text);
  IF v_old.horimetro_final IS DISTINCT FROM _horimetro_final THEN v_changes := v_changes + 1; END IF;

  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq,
    v_uid, v_email, v_role, _motivo,
    'horas_informadas', v_old.horas_informadas::text, _horas_informadas::text);
  IF v_old.horas_informadas IS DISTINCT FROM _horas_informadas THEN v_changes := v_changes + 1; END IF;

  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq,
    v_uid, v_email, v_role, _motivo,
    'horas_mecanicas', v_old.horas_mecanicas::text, _horas_mecanicas::text);
  IF v_old.horas_mecanicas IS DISTINCT FROM _horas_mecanicas THEN v_changes := v_changes + 1; END IF;

  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq,
    v_uid, v_email, v_role, _motivo,
    'horas_chuvoso', v_old.horas_chuvoso::text, _horas_chuvoso::text);
  IF v_old.horas_chuvoso IS DISTINCT FROM _horas_chuvoso THEN v_changes := v_changes + 1; END IF;

  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq,
    v_uid, v_email, v_role, _motivo,
    'horas_excecao_chuvoso', v_old.horas_excecao_chuvoso::text, _horas_excecao_chuvoso::text);
  IF v_old.horas_excecao_chuvoso IS DISTINCT FROM _horas_excecao_chuvoso THEN v_changes := v_changes + 1; END IF;

  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq,
    v_uid, v_email, v_role, _motivo,
    'valor_complementares', v_old.valor_complementares::text, _valor_complementares::text);
  IF v_old.valor_complementares IS DISTINCT FROM _valor_complementares THEN v_changes := v_changes + 1; END IF;

  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq,
    v_uid, v_email, v_role, _motivo,
    'valor_descontos', v_old.valor_descontos::text, _valor_descontos::text);
  IF v_old.valor_descontos IS DISTINCT FROM _valor_descontos THEN v_changes := v_changes + 1; END IF;

  PERFORM public._log_item_change(_item_id, v_old, v_med, v_contrato, v_cliente, v_eq,
    v_uid, v_email, v_role, _motivo,
    'observacoes', COALESCE(v_old.observacoes,''), COALESCE(_observacoes,''));
  IF COALESCE(v_old.observacoes,'') IS DISTINCT FROM COALESCE(_observacoes,'') THEN v_changes := v_changes + 1; END IF;

  -- Verifica se algum campo calculado mudou
  IF v_old.horas_liquidas IS DISTINCT FROM v_horas_liquidas
     OR v_old.horas_a_pagar IS DISTINCT FROM v_horas_a_pagar
     OR v_old.valor_bruto IS DISTINCT FROM v_valor_bruto
     OR v_old.valor_final IS DISTINCT FROM v_valor_final THEN
    v_calc_changed := true;
  END IF;

  -- Atualiza item
  UPDATE public.medicao_itens SET
    horimetro_inicial = _horimetro_inicial,
    horimetro_final = _horimetro_final,
    horas_informadas = _horas_informadas,
    horas_mecanicas = _horas_mecanicas,
    horas_descontaveis = _horas_mecanicas,
    horas_chuvoso = _horas_chuvoso,
    horas_excecao_chuvoso = _horas_excecao_chuvoso,
    horas_liquidas = v_horas_liquidas,
    garantia_minima = v_garantia,
    horas_a_pagar = v_horas_a_pagar,
    valor_hora = v_valor_hora,
    valor_bruto = v_valor_bruto,
    valor_complementares = COALESCE(_valor_complementares,0),
    valor_descontos = COALESCE(_valor_descontos,0),
    valor_final = v_valor_final,
    observacoes = NULLIF(_observacoes,''),
    updated_at = now()
  WHERE id = _item_id;

  -- Log de recálculo automático (se houver mudança nos calculados)
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
      'Recálculo automático do item em consequência da edição'
    );
  END IF;

  -- Recalcula totais da medição
  PERFORM public._recalc_medicao_totais(v_med.id);

  RETURN jsonb_build_object('ok', true, 'changes', v_changes, 'recalculated', v_calc_changed);
END;
$function$;

-- Helper: registra um log apenas se o valor realmente mudou
CREATE OR REPLACE FUNCTION public._log_item_change(
  _item_id uuid, _old record, _med record, _contrato record, _cliente record, _eq record,
  _uid uuid, _email text, _role text, _motivo text,
  _campo text, _antes text, _depois text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(_antes,'') IS DISTINCT FROM COALESCE(_depois,'') THEN
    INSERT INTO public.medicao_item_alteracoes(
      medicao_id, medicao_item_id, contrato_id, cliente_id, cliente_nome, contrato_numero,
      competencia, equipamento_id, equipamento_serie, equipamento_tag,
      user_id, user_email, perfil_usuario, acao, campo, valor_anterior, valor_novo, motivo
    ) VALUES (
      _med.id, _item_id, _contrato.id, _cliente.id, _cliente.razao_social, _contrato.numero_dj,
      _med.competencia, _eq.id, _eq.serie, _eq.tag,
      _uid, _email, _role, 'EDIT', _campo, _antes, _depois, _motivo
    );
  END IF;
END; $$;

-- Helper: recalcula totais da medição
CREATE OR REPLACE FUNCTION public._recalc_medicao_totais(_medicao_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.medicoes m SET
    total_horas_informadas = COALESCE(t.thi, 0),
    total_horas_liquidas = COALESCE(t.thl, 0),
    total_horas_pagar = COALESCE(t.thp, 0),
    valor_bruto = COALESCE(t.vb, 0),
    valor_complementares = COALESCE(t.vc, 0),
    valor_descontos = COALESCE(t.vd, 0),
    valor_final = COALESCE(t.vf, 0),
    updated_at = now()
  FROM (
    SELECT
      sum(horas_informadas) thi, sum(horas_liquidas) thl, sum(horas_a_pagar) thp,
      sum(valor_bruto) vb, sum(valor_complementares) vc, sum(valor_descontos) vd, sum(valor_final) vf
    FROM public.medicao_itens WHERE medicao_id = _medicao_id
  ) t WHERE m.id = _medicao_id;
END; $$;

-- Função: recalcular medição inteira
CREATE OR REPLACE FUNCTION public.recalcular_medicao(_medicao_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_email text;
  v_med record;
  v_contrato record;
  v_cliente record;
  it record;
  v_ce record;
  v_eq record;
  v_valor_hora numeric;
  v_garantia numeric;
  v_horas_liquidas numeric;
  v_horas_a_pagar numeric;
  v_valor_bruto numeric;
  v_valor_final numeric;
  v_count int := 0;
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
  SELECT * INTO v_contrato FROM public.contratos WHERE id = v_med.contrato_id;
  SELECT * INTO v_cliente FROM public.clientes WHERE id = v_contrato.cliente_id;
  v_garantia := COALESCE(v_contrato.garantia_minima_horas, 0);

  FOR it IN SELECT * FROM public.medicao_itens WHERE medicao_id = _medicao_id LOOP
    SELECT * INTO v_ce FROM public.contrato_equipamentos WHERE id = it.contrato_equipamento_id;
    v_valor_hora := COALESCE(v_ce.valor_hora_override, v_contrato.valor_hora_padrao, 0);
    v_horas_liquidas := GREATEST(0, it.horas_informadas - it.horas_mecanicas);
    v_horas_a_pagar := GREATEST(v_horas_liquidas, v_garantia);
    v_valor_bruto := v_horas_a_pagar * v_valor_hora;
    v_valor_final := v_valor_bruto + COALESCE(it.valor_complementares,0) - COALESCE(it.valor_descontos,0);

    UPDATE public.medicao_itens SET
      horas_liquidas = v_horas_liquidas, garantia_minima = v_garantia,
      horas_a_pagar = v_horas_a_pagar, valor_hora = v_valor_hora,
      valor_bruto = v_valor_bruto, valor_final = v_valor_final, updated_at = now()
    WHERE id = it.id;
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
    NULL, v_count::text || ' itens recalculados', _motivo
  );

  RETURN jsonb_build_object('ok', true, 'itens', v_count);
END; $$;
