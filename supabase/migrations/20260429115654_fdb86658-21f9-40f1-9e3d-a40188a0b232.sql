DROP POLICY IF EXISTS p_mia_read_aprovador ON medicao_item_alteracoes;
DROP FUNCTION IF EXISTS public.cancel_medicao(uuid, text);

ALTER TYPE medicao_status RENAME TO medicao_status_old;

CREATE TYPE medicao_status AS ENUM (
  'rascunho','em_revisao_interna','aprovada_internamente','enviada_cliente',
  'aprovada_cliente','reprovada_cliente','faturada','paga','cancelada'
);

ALTER TABLE medicoes
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE medicao_status USING (
    CASE status::text
      WHEN 'rascunho' THEN 'rascunho'
      WHEN 'importada' THEN 'rascunho'
      WHEN 'revisao_tecnica' THEN 'em_revisao_interna'
      WHEN 'aprovada' THEN 'aprovada_internamente'
      WHEN 'rejeitada' THEN 'rascunho'
      WHEN 'contestada' THEN 'em_revisao_interna'
      WHEN 'faturada' THEN 'faturada'
      WHEN 'cancelada' THEN 'cancelada'
      ELSE 'rascunho'
    END
  )::medicao_status,
  ALTER COLUMN status SET DEFAULT 'rascunho'::medicao_status;

DROP TYPE medicao_status_old;

CREATE POLICY p_mia_read_aprovador ON medicao_item_alteracoes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'visualizacao'::app_role)
    AND EXISTS (
      SELECT 1 FROM medicoes m
      WHERE m.id = medicao_item_alteracoes.medicao_id
        AND m.status::text = ANY (ARRAY[
          'em_revisao_interna','aprovada_internamente','enviada_cliente',
          'aprovada_cliente','faturada','paga'
        ])
    )
  );

CREATE TABLE public.medicao_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id uuid NOT NULL,
  status_anterior medicao_status,
  status_novo medicao_status NOT NULL,
  user_id uuid,
  user_email text,
  perfil_usuario text,
  motivo text,
  observacoes text,
  contexto jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_msh_medicao ON public.medicao_status_historico(medicao_id, created_at DESC);
ALTER TABLE public.medicao_status_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_msh_read ON public.medicao_status_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY p_msh_insert ON public.medicao_status_historico FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'gestor_contrato'::app_role,'operacional'::app_role,'faturamento'::app_role,'visualizacao'::app_role]));

ALTER TABLE public.medicoes
  ADD COLUMN IF NOT EXISTS enviada_cliente_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS enviada_cliente_por uuid,
  ADD COLUMN IF NOT EXISTS aprovada_cliente_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS aprovada_cliente_por uuid,
  ADD COLUMN IF NOT EXISTS aprovador_cliente_nome text;

CREATE OR REPLACE FUNCTION public._registrar_status_medicao(
  _medicao_id uuid, _status_anterior medicao_status, _status_novo medicao_status,
  _motivo text DEFAULT NULL, _observacoes text DEFAULT NULL, _contexto jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _email text; _perfil text;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  SELECT string_agg(role::text, ',') INTO _perfil FROM user_roles WHERE user_id = _uid;
  INSERT INTO medicao_status_historico
    (medicao_id, status_anterior, status_novo, user_id, user_email, perfil_usuario, motivo, observacoes, contexto)
  VALUES (_medicao_id, _status_anterior, _status_novo, _uid, _email, _perfil, _motivo, _observacoes, COALESCE(_contexto,'{}'::jsonb));
  INSERT INTO audit_log (entidade, entidade_id, acao, user_id, perfil_usuario, motivo, contexto)
  VALUES ('medicao', _medicao_id, 'status_change', _uid, _perfil, _motivo,
    jsonb_build_object('de', _status_anterior, 'para', _status_novo, 'observacoes', _observacoes) || COALESCE(_contexto,'{}'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public._exigir_papel(_papeis app_role[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), _papeis) THEN
    RAISE EXCEPTION 'Permissão negada para esta ação';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.enviar_para_revisao(_medicao_id uuid, _observacoes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status;
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','gestor_contrato','operacional']::app_role[]);
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual IS NULL THEN RAISE EXCEPTION 'Medição não encontrada'; END IF;
  IF _atual <> 'rascunho' THEN RAISE EXCEPTION 'Só é possível enviar para revisão a partir do status Rascunho'; END IF;
  UPDATE medicoes SET status = 'em_revisao_interna', updated_at = now() WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'em_revisao_interna', NULL, _observacoes);
END; $$;

CREATE OR REPLACE FUNCTION public.aprovar_internamente(_medicao_id uuid, _observacoes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status;
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','gestor_contrato']::app_role[]);
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual <> 'em_revisao_interna' THEN RAISE EXCEPTION 'Só é possível aprovar internamente medições Em revisão interna'; END IF;
  UPDATE medicoes SET status = 'aprovada_internamente', updated_at = now() WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'aprovada_internamente', NULL, _observacoes);
END; $$;

CREATE OR REPLACE FUNCTION public.devolver_para_rascunho(_medicao_id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status;
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','gestor_contrato']::app_role[]);
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN RAISE EXCEPTION 'Motivo obrigatório (mínimo 5 caracteres)'; END IF;
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual NOT IN ('em_revisao_interna','aprovada_internamente','reprovada_cliente') THEN
    RAISE EXCEPTION 'Não é possível devolver para rascunho a partir do status atual';
  END IF;
  UPDATE medicoes SET status = 'rascunho', updated_at = now() WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'rascunho', _motivo, NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.devolver_para_revisao(_medicao_id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status;
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','gestor_contrato']::app_role[]);
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN RAISE EXCEPTION 'Motivo obrigatório (mínimo 5 caracteres)'; END IF;
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual <> 'aprovada_internamente' THEN RAISE EXCEPTION 'Apenas medições Aprovadas internamente podem voltar para revisão'; END IF;
  UPDATE medicoes SET status = 'em_revisao_interna', updated_at = now() WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'em_revisao_interna', _motivo, NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.enviar_ao_cliente(_medicao_id uuid, _observacoes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status; _uid uuid := auth.uid();
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','gestor_contrato']::app_role[]);
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual <> 'aprovada_internamente' THEN RAISE EXCEPTION 'Só é possível enviar ao cliente medições Aprovadas internamente'; END IF;
  UPDATE medicoes SET status = 'enviada_cliente', enviada_cliente_em = now(), enviada_cliente_por = _uid, updated_at = now()
    WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'enviada_cliente', NULL, _observacoes);
END; $$;

CREATE OR REPLACE FUNCTION public.aprovar_pelo_cliente(_medicao_id uuid, _aprovador_nome text DEFAULT NULL, _observacoes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status; _uid uuid := auth.uid();
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','gestor_contrato','visualizacao']::app_role[]);
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual <> 'enviada_cliente' THEN RAISE EXCEPTION 'Apenas medições Enviadas ao cliente podem ser aprovadas pelo cliente'; END IF;
  UPDATE medicoes
    SET status = 'aprovada_cliente', aprovada_cliente_em = now(), aprovada_cliente_por = _uid,
        aprovador_cliente_nome = COALESCE(_aprovador_nome, aprovador_cliente_nome), updated_at = now()
    WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'aprovada_cliente', NULL, _observacoes,
    jsonb_build_object('aprovador_cliente_nome', _aprovador_nome));
END; $$;

CREATE OR REPLACE FUNCTION public.reprovar_pelo_cliente(_medicao_id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status;
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','gestor_contrato','visualizacao']::app_role[]);
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN RAISE EXCEPTION 'Motivo obrigatório (mínimo 5 caracteres)'; END IF;
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual <> 'enviada_cliente' THEN RAISE EXCEPTION 'Apenas medições Enviadas ao cliente podem ser reprovadas pelo cliente'; END IF;
  UPDATE medicoes SET status = 'reprovada_cliente', updated_at = now() WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'reprovada_cliente', _motivo, NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.faturar_medicao(_medicao_id uuid, _numero_nf text, _data_emissao date, _valor numeric, _data_vencimento date, _observacoes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status; _uid uuid := auth.uid();
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','faturamento']::app_role[]);
  IF _numero_nf IS NULL OR length(trim(_numero_nf)) = 0 THEN RAISE EXCEPTION 'Número da NF obrigatório'; END IF;
  IF _valor IS NULL OR _valor <= 0 THEN RAISE EXCEPTION 'Valor da NF deve ser maior que zero'; END IF;
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual <> 'aprovada_cliente' THEN RAISE EXCEPTION 'Apenas medições Aprovadas pelo cliente podem ser faturadas'; END IF;

  INSERT INTO faturas (medicao_id, numero_nf, data_emissao, valor, data_vencimento, observacoes, status, created_by)
  VALUES (_medicao_id, _numero_nf, _data_emissao, _valor, _data_vencimento, _observacoes, 'pendente', _uid);

  UPDATE medicoes SET status = 'faturada', updated_at = now() WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'faturada', NULL, _observacoes,
    jsonb_build_object('numero_nf', _numero_nf, 'valor_nf', _valor, 'data_emissao', _data_emissao, 'data_vencimento', _data_vencimento));
END; $$;

CREATE OR REPLACE FUNCTION public.marcar_como_paga(_medicao_id uuid, _data_pagamento date, _valor_pago numeric DEFAULT NULL, _observacoes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status;
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','faturamento']::app_role[]);
  IF _data_pagamento IS NULL THEN RAISE EXCEPTION 'Data de pagamento obrigatória'; END IF;
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual <> 'faturada' THEN RAISE EXCEPTION 'Apenas medições Faturadas podem ser marcadas como pagas'; END IF;
  UPDATE faturas
    SET status = 'paga', data_pagamento = _data_pagamento,
        valor = COALESCE(_valor_pago, valor),
        observacoes = COALESCE(_observacoes, observacoes),
        updated_at = now()
    WHERE medicao_id = _medicao_id;
  UPDATE medicoes SET status = 'paga', updated_at = now() WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'paga', NULL, _observacoes,
    jsonb_build_object('data_pagamento', _data_pagamento, 'valor_pago', _valor_pago));
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_medicao(_medicao_id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _atual medicao_status;
BEGIN
  PERFORM _exigir_papel(ARRAY['admin','gestor_contrato']::app_role[]);
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN RAISE EXCEPTION 'Motivo obrigatório (mínimo 5 caracteres)'; END IF;
  SELECT status INTO _atual FROM medicoes WHERE id = _medicao_id FOR UPDATE;
  IF _atual IN ('faturada','paga','cancelada') THEN
    RAISE EXCEPTION 'Não é possível cancelar medição já faturada, paga ou cancelada';
  END IF;
  UPDATE medicoes SET status = 'cancelada', updated_at = now() WHERE id = _medicao_id;
  PERFORM _registrar_status_medicao(_medicao_id, _atual, 'cancelada', _motivo, NULL);
END; $$;

CREATE OR REPLACE FUNCTION public._bloquear_edicao_itens_fora_rascunho()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st medicao_status; _med uuid;
BEGIN
  _med := COALESCE(NEW.medicao_id, OLD.medicao_id);
  SELECT status INTO _st FROM medicoes WHERE id = _med;
  IF _st <> 'rascunho' AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Edição de itens só permitida em medições no status Rascunho (status atual: %)', _st;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_bloquear_edicao_itens ON medicao_itens;
CREATE TRIGGER trg_bloquear_edicao_itens
  BEFORE INSERT OR UPDATE OR DELETE ON medicao_itens
  FOR EACH ROW EXECUTE FUNCTION public._bloquear_edicao_itens_fora_rascunho();
