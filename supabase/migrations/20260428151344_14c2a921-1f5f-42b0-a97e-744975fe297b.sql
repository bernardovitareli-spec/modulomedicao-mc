
-- 1) Novos status de medição
ALTER TYPE medicao_status ADD VALUE IF NOT EXISTS 'cancelada';
ALTER TYPE medicao_status ADD VALUE IF NOT EXISTS 'importada';

-- 2) Campos extra no audit_log
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS perfil_usuario text,
  ADD COLUMN IF NOT EXISTS contexto jsonb DEFAULT '{}'::jsonb;

-- 3) Helper: pegar primeiro role do usuário (para registrar perfil)
CREATE OR REPLACE FUNCTION public.get_primary_role(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles
  WHERE user_id = _uid
  ORDER BY CASE role
    WHEN 'admin' THEN 1
    WHEN 'gestor_contrato' THEN 2
    WHEN 'operacional' THEN 3
    WHEN 'faturamento' THEN 4
    WHEN 'visualizacao' THEN 5
  END
  LIMIT 1;
$$;

-- 4) Função: excluir medição com segurança
CREATE OR REPLACE FUNCTION public.delete_medicao_safe(
  _medicao_id uuid,
  _motivo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_med record;
  v_qtd_itens int;
  v_qtd_fat int;
  v_qtd_aprov int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 3 THEN
    RAISE EXCEPTION 'Motivo da exclusão é obrigatório (mínimo 3 caracteres)';
  END IF;

  v_role := public.get_primary_role(v_uid);

  SELECT m.*, c.numero_dj, cl.razao_social
  INTO v_med
  FROM public.medicoes m
  LEFT JOIN public.contratos c ON c.id = m.contrato_id
  LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
  WHERE m.id = _medicao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Medição não encontrada'; END IF;

  -- Permissões por perfil
  IF v_role = 'admin' THEN
    IF v_med.status NOT IN ('rascunho','importada','rejeitada') THEN
      RAISE EXCEPTION 'Status % não permite exclusão. Use cancelar.', v_med.status;
    END IF;
  ELSIF v_role = 'gestor_contrato' THEN
    IF v_med.status <> 'rascunho' THEN
      RAISE EXCEPTION 'Gestor só pode excluir medições em rascunho';
    END IF;
  ELSE
    RAISE EXCEPTION 'Perfil sem permissão para excluir medições';
  END IF;

  SELECT count(*) INTO v_qtd_fat FROM public.faturas WHERE medicao_id = _medicao_id;
  SELECT count(*) INTO v_qtd_aprov FROM public.aprovacoes WHERE medicao_id = _medicao_id AND resultado = 'aprovado';
  IF v_qtd_fat > 0 OR v_qtd_aprov > 0 THEN
    RAISE EXCEPTION 'Existem aprovações ou faturas vinculadas. Use cancelar.';
  END IF;

  SELECT count(*) INTO v_qtd_itens FROM public.medicao_itens WHERE medicao_id = _medicao_id;

  -- Log antes de excluir
  INSERT INTO public.audit_log(entidade, entidade_id, acao, dados_antes, user_id, motivo, perfil_usuario, contexto)
  VALUES (
    'medicoes', _medicao_id, 'DELETE_SAFE', to_jsonb(v_med), v_uid, _motivo, v_role,
    jsonb_build_object(
      'cliente', v_med.razao_social,
      'contrato', v_med.numero_dj,
      'competencia', v_med.competencia,
      'qtd_itens', v_qtd_itens
    )
  );

  DELETE FROM public.aprovacoes WHERE medicao_id = _medicao_id;
  DELETE FROM public.faturas WHERE medicao_id = _medicao_id;
  DELETE FROM public.medicao_itens WHERE medicao_id = _medicao_id;
  DELETE FROM public.medicoes WHERE id = _medicao_id;

  RETURN jsonb_build_object('ok', true, 'qtd_itens', v_qtd_itens);
END;
$$;

-- 5) Cancelar medição (mantém histórico)
CREATE OR REPLACE FUNCTION public.cancel_medicao(
  _medicao_id uuid,
  _motivo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_med record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 3 THEN
    RAISE EXCEPTION 'Motivo é obrigatório';
  END IF;
  v_role := public.get_primary_role(v_uid);
  IF v_role NOT IN ('admin','gestor_contrato') THEN
    RAISE EXCEPTION 'Sem permissão para cancelar';
  END IF;

  SELECT * INTO v_med FROM public.medicoes WHERE id = _medicao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Medição não encontrada'; END IF;
  IF v_med.status IN ('faturada') THEN
    RAISE EXCEPTION 'Medição faturada não pode ser cancelada';
  END IF;

  UPDATE public.medicoes SET status = 'cancelada', updated_at = now() WHERE id = _medicao_id;

  INSERT INTO public.audit_log(entidade, entidade_id, acao, dados_antes, user_id, motivo, perfil_usuario)
  VALUES ('medicoes', _medicao_id, 'CANCEL', to_jsonb(v_med), v_uid, _motivo, v_role);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6) Limpar importação de teste (admin)
CREATE OR REPLACE FUNCTION public.purge_importacao_teste(
  _importacao_id uuid,
  _motivo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_med_ids uuid[];
  v_eq_ids uuid[];
  v_contrato_ids uuid[];
  v_cliente_ids uuid[];
  v_eq_removidos int := 0;
  v_contr_removidos int := 0;
  v_cli_removidos int := 0;
  v_med_removidas int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_role := public.get_primary_role(v_uid);
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'Apenas Administrador'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 3 THEN RAISE EXCEPTION 'Motivo obrigatório'; END IF;

  SELECT array_agg(id) INTO v_med_ids FROM public.medicoes WHERE importacao_id = _importacao_id;

  IF v_med_ids IS NOT NULL THEN
    SELECT array_agg(DISTINCT equipamento_id) INTO v_eq_ids
      FROM public.medicao_itens WHERE medicao_id = ANY(v_med_ids);
    SELECT array_agg(DISTINCT contrato_id) INTO v_contrato_ids
      FROM public.medicoes WHERE id = ANY(v_med_ids);
    SELECT array_agg(DISTINCT cliente_id) INTO v_cliente_ids
      FROM public.contratos WHERE id = ANY(v_contrato_ids);

    -- Bloqueio: status sensível
    IF EXISTS (SELECT 1 FROM public.medicoes WHERE id = ANY(v_med_ids)
               AND status IN ('aprovada','faturada')) THEN
      RAISE EXCEPTION 'Importação contém medições aprovadas/faturadas';
    END IF;

    DELETE FROM public.aprovacoes WHERE medicao_id = ANY(v_med_ids);
    DELETE FROM public.faturas WHERE medicao_id = ANY(v_med_ids);
    DELETE FROM public.medicao_itens WHERE medicao_id = ANY(v_med_ids);
    DELETE FROM public.medicoes WHERE id = ANY(v_med_ids);
    GET DIAGNOSTICS v_med_removidas = ROW_COUNT;

    -- Equipamentos órfãos
    IF v_eq_ids IS NOT NULL THEN
      DELETE FROM public.contrato_equipamentos
        WHERE equipamento_id = ANY(v_eq_ids)
        AND NOT EXISTS (SELECT 1 FROM public.medicao_itens mi WHERE mi.equipamento_id = contrato_equipamentos.equipamento_id);
      DELETE FROM public.equipamentos
        WHERE id = ANY(v_eq_ids)
        AND NOT EXISTS (SELECT 1 FROM public.medicao_itens mi WHERE mi.equipamento_id = equipamentos.id);
      GET DIAGNOSTICS v_eq_removidos = ROW_COUNT;
    END IF;

    -- Contratos órfãos
    IF v_contrato_ids IS NOT NULL THEN
      DELETE FROM public.contrato_equipamentos WHERE contrato_id = ANY(v_contrato_ids)
        AND NOT EXISTS (SELECT 1 FROM public.medicoes m WHERE m.contrato_id = contrato_equipamentos.contrato_id);
      DELETE FROM public.contrato_regras WHERE contrato_id = ANY(v_contrato_ids)
        AND NOT EXISTS (SELECT 1 FROM public.medicoes m WHERE m.contrato_id = contrato_regras.contrato_id);
      DELETE FROM public.contrato_alteracoes WHERE contrato_id = ANY(v_contrato_ids)
        AND NOT EXISTS (SELECT 1 FROM public.medicoes m WHERE m.contrato_id = contrato_alteracoes.contrato_id);
      DELETE FROM public.contratos
        WHERE id = ANY(v_contrato_ids)
        AND NOT EXISTS (SELECT 1 FROM public.medicoes m WHERE m.contrato_id = contratos.id);
      GET DIAGNOSTICS v_contr_removidos = ROW_COUNT;
    END IF;

    -- Clientes órfãos
    IF v_cliente_ids IS NOT NULL THEN
      DELETE FROM public.clientes
        WHERE id = ANY(v_cliente_ids)
        AND NOT EXISTS (SELECT 1 FROM public.contratos c WHERE c.cliente_id = clientes.id);
      GET DIAGNOSTICS v_cli_removidos = ROW_COUNT;
    END IF;
  END IF;

  DELETE FROM public.importacoes WHERE id = _importacao_id;

  INSERT INTO public.audit_log(entidade, entidade_id, acao, user_id, motivo, perfil_usuario, contexto)
  VALUES ('importacoes', _importacao_id, 'PURGE', v_uid, _motivo, v_role,
    jsonb_build_object('medicoes', v_med_removidas, 'equipamentos', v_eq_removidos, 'contratos', v_contr_removidos, 'clientes', v_cli_removidos));

  RETURN jsonb_build_object('ok', true,
    'medicoes', v_med_removidas, 'equipamentos', v_eq_removidos,
    'contratos', v_contr_removidos, 'clientes', v_cli_removidos);
END;
$$;

-- 7) Admin define role de outro usuário
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  _target_user uuid,
  _role app_role
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administrador';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _target_user;
  INSERT INTO public.user_roles(user_id, role) VALUES (_target_user, _role);
END;
$$;

-- 8) Listar usuários (admin)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id uuid, email text, role app_role, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administrador';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, ur.role, u.created_at
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$;

-- 9) Restringir DELETE direto em clientes/contratos/equipamentos: apenas admin
DROP POLICY IF EXISTS p_delete_admin ON public.clientes;
CREATE POLICY p_delete_admin ON public.clientes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS p_delete_admin ON public.contratos;
CREATE POLICY p_delete_admin ON public.contratos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS p_delete_admin ON public.equipamentos;
CREATE POLICY p_delete_admin ON public.equipamentos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
