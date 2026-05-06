
-- 1. Remove a constraint UNIQUE simples; manter apenas o índice parcial uq_faturas_medicao_ativa
ALTER TABLE public.faturas DROP CONSTRAINT IF EXISTS faturas_medicao_id_key;

-- 2. Permitir que perfil Financeiro atualize/insira clientes
DROP POLICY IF EXISTS p_clientes_financeiro_update ON public.clientes;
CREATE POLICY p_clientes_financeiro_update ON public.clientes
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'gestor_contrato'::app_role,'faturamento'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'gestor_contrato'::app_role,'faturamento'::app_role]));

DROP POLICY IF EXISTS p_clientes_financeiro_insert ON public.clientes;
CREATE POLICY p_clientes_financeiro_insert ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'gestor_contrato'::app_role,'faturamento'::app_role]));

-- 3. criar_faturamento: garantir mensagem amigável e permitir quando só houver cancelado
CREATE OR REPLACE FUNCTION public.criar_faturamento(_medicao_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_role text; v_med record; v_fid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_role := public.get_primary_role(auth.uid());
  IF v_role NOT IN ('admin','faturamento') THEN
    RAISE EXCEPTION 'Sem permissão para criar faturamento';
  END IF;

  SELECT * INTO v_med FROM public.medicoes WHERE id = _medicao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Medição não encontrada'; END IF;
  IF v_med.status NOT IN ('aprovada_cliente') THEN
    RAISE EXCEPTION 'Apenas medições Aprovadas pelo cliente podem ser faturadas (status atual: %)', v_med.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.faturas WHERE medicao_id = _medicao_id AND status <> 'cancelado') THEN
    RAISE EXCEPTION 'Já existe um faturamento ativo para esta medição';
  END IF;

  INSERT INTO public.faturas (medicao_id, valor, status, created_by)
  VALUES (_medicao_id, v_med.valor_final, 'a_faturar', auth.uid())
  RETURNING id INTO v_fid;

  UPDATE public.medicoes SET status = 'faturada', updated_at = now() WHERE id = _medicao_id;

  PERFORM public._log_fatura_change(v_fid, _medicao_id, 'CRIAR', NULL, NULL,
    'Faturamento criado a partir da medição', 'Criação inicial',
    jsonb_build_object('valor_medicao', v_med.valor_final));

  INSERT INTO public.medicao_status_historico (medicao_id, status_anterior, status_novo, user_id, user_email, perfil_usuario, motivo)
  SELECT _medicao_id, 'aprovada_cliente'::medicao_status, 'faturada'::medicao_status, auth.uid(), u.email, v_role, 'Faturamento criado'
  FROM auth.users u WHERE u.id = auth.uid();

  RETURN v_fid;
END $$;

-- 4. Reabrir faturamento cancelado (reusa fatura existente)
CREATE OR REPLACE FUNCTION public.reabrir_faturamento_cancelado(_fatura_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_role text; v_fat record; v_med record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_role := public.get_primary_role(auth.uid());
  IF v_role NOT IN ('admin','faturamento') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_fat FROM public.faturas WHERE id = _fatura_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Faturamento não encontrado'; END IF;
  IF v_fat.status <> 'cancelado' THEN
    RAISE EXCEPTION 'Apenas faturamentos cancelados podem ser reabertos';
  END IF;

  IF EXISTS (SELECT 1 FROM public.faturas WHERE medicao_id = v_fat.medicao_id AND status <> 'cancelado' AND id <> _fatura_id) THEN
    RAISE EXCEPTION 'Já existe um faturamento ativo para esta medição';
  END IF;

  SELECT * INTO v_med FROM public.medicoes WHERE id = v_fat.medicao_id FOR UPDATE;

  UPDATE public.faturas SET
    status = 'a_faturar',
    valor = COALESCE(v_med.valor_final, valor),
    valor_bruto = COALESCE(v_med.valor_final, valor_bruto),
    valor_liquido = COALESCE(v_med.valor_final, valor_liquido),
    updated_at = now()
  WHERE id = _fatura_id;

  IF v_med.status = 'aprovada_cliente' THEN
    UPDATE public.medicoes SET status = 'faturada', updated_at = now() WHERE id = v_fat.medicao_id;
    INSERT INTO public.medicao_status_historico (medicao_id, status_anterior, status_novo, user_id, user_email, perfil_usuario, motivo)
    SELECT v_fat.medicao_id, 'aprovada_cliente'::medicao_status, 'faturada'::medicao_status, auth.uid(), u.email, v_role, 'Faturamento cancelado reaberto'
    FROM auth.users u WHERE u.id = auth.uid();
  END IF;

  PERFORM public._log_fatura_change(_fatura_id, v_fat.medicao_id, 'REABRIR', 'status',
    'cancelado', 'a_faturar', 'Faturamento cancelado reaberto', NULL);

  RETURN _fatura_id;
END $$;
