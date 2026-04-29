-- ==========================================================
-- MÓDULO DE FATURAMENTO — Fase 1
-- Estende a tabela `faturas` existente
-- ==========================================================

-- 1) Novo enum de status do faturamento (substitui fatura_status antigo)
DO $$ BEGIN
  CREATE TYPE public.faturamento_status AS ENUM (
    'a_faturar',
    'nf_emitida',
    'aguardando_pagamento',
    'pago',
    'pago_parcial',
    'em_atraso',
    'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Adicionar novas colunas em faturas
ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS serie_nf text,
  ADD COLUMN IF NOT EXISTS valor_bruto numeric,
  ADD COLUMN IF NOT EXISTS valor_liquido numeric,
  ADD COLUMN IF NOT EXISTS valor_recebido numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_diferenca text,
  ADD COLUMN IF NOT EXISTS data_prevista_recebimento date,
  ADD COLUMN IF NOT EXISTS observacoes_fiscais text,
  ADD COLUMN IF NOT EXISTS observacoes_financeiras text,
  ADD COLUMN IF NOT EXISTS anexo_nf_storage_path text,
  ADD COLUMN IF NOT EXISTS anexo_nf_nome text,
  ADD COLUMN IF NOT EXISTS status_novo public.faturamento_status;

-- 3) Migrar status antigos -> novos
UPDATE public.faturas SET status_novo = CASE
  WHEN status::text = 'pendente'  THEN 'a_faturar'::public.faturamento_status
  WHEN status::text = 'emitida'   THEN 'nf_emitida'::public.faturamento_status
  WHEN status::text = 'paga'      THEN 'pago'::public.faturamento_status
  WHEN status::text = 'cancelada' THEN 'cancelado'::public.faturamento_status
  ELSE 'a_faturar'::public.faturamento_status
END WHERE status_novo IS NULL;

-- 4) Trocar a coluna status para o novo enum
ALTER TABLE public.faturas DROP COLUMN status;
ALTER TABLE public.faturas RENAME COLUMN status_novo TO status;
ALTER TABLE public.faturas ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.faturas ALTER COLUMN status SET DEFAULT 'a_faturar'::public.faturamento_status;

-- 5) Unicidade: 1 faturamento ATIVO por medição (cancelados podem coexistir)
CREATE UNIQUE INDEX IF NOT EXISTS uq_faturas_medicao_ativa
  ON public.faturas(medicao_id)
  WHERE status <> 'cancelado'::public.faturamento_status;

-- 6) Histórico de faturamento
CREATE TABLE IF NOT EXISTS public.faturamento_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid NOT NULL,
  medicao_id uuid,
  user_id uuid,
  user_email text,
  perfil_usuario text,
  acao text NOT NULL,
  campo text,
  valor_anterior text,
  valor_novo text,
  motivo text,
  contexto jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.faturamento_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_fh_read ON public.faturamento_historico;
CREATE POLICY p_fh_read ON public.faturamento_historico
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_fh_insert ON public.faturamento_historico;
CREATE POLICY p_fh_insert ON public.faturamento_historico
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional','faturamento','visualizacao']::app_role[]));

CREATE INDEX IF NOT EXISTS idx_fh_fatura ON public.faturamento_historico(fatura_id, created_at DESC);

-- 7) RLS update — financeiro pode editar
DROP POLICY IF EXISTS p_write ON public.faturas;
CREATE POLICY p_write ON public.faturas
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','faturamento']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','faturamento']::app_role[]));

-- 8) Função auxiliar: status calculado
CREATE OR REPLACE FUNCTION public._calc_status_faturamento(_f public.faturas)
RETURNS public.faturamento_status
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF _f.status = 'cancelado' THEN RETURN 'cancelado'; END IF;
  IF _f.valor_recebido IS NOT NULL AND _f.valor_liquido IS NOT NULL AND _f.valor_recebido > 0 THEN
    IF _f.valor_recebido >= _f.valor_liquido THEN RETURN 'pago';
    ELSE RETURN 'pago_parcial';
    END IF;
  END IF;
  IF _f.data_vencimento IS NOT NULL AND _f.data_vencimento < CURRENT_DATE
     AND COALESCE(_f.valor_recebido,0) = 0 THEN
    RETURN 'em_atraso';
  END IF;
  IF _f.data_vencimento IS NOT NULL THEN RETURN 'aguardando_pagamento'; END IF;
  IF _f.numero_nf IS NOT NULL AND _f.data_emissao IS NOT NULL THEN RETURN 'nf_emitida'; END IF;
  RETURN 'a_faturar';
END $$;

-- 9) Helper de log
CREATE OR REPLACE FUNCTION public._log_fatura_change(
  _fatura_id uuid, _medicao_id uuid, _acao text, _campo text,
  _antes text, _depois text, _motivo text, _ctx jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_email text; v_role text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  v_role := public.get_primary_role(auth.uid());
  INSERT INTO public.faturamento_historico
    (fatura_id, medicao_id, user_id, user_email, perfil_usuario, acao, campo, valor_anterior, valor_novo, motivo, contexto)
  VALUES (_fatura_id, _medicao_id, auth.uid(), v_email, v_role, _acao, _campo, _antes, _depois, _motivo, _ctx);
END $$;

-- 10) RPC: Criar faturamento
CREATE OR REPLACE FUNCTION public.criar_faturamento(_medicao_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_med record; v_fid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_role := public.get_primary_role(auth.uid());
  IF v_role NOT IN ('admin','faturamento') THEN
    RAISE EXCEPTION 'Sem permissão para criar faturamento';
  END IF;

  SELECT * INTO v_med FROM public.medicoes WHERE id = _medicao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Medição não encontrada'; END IF;
  IF v_med.status <> 'aprovada_cliente' THEN
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

-- 11) RPC: Atualizar dados da NF / financeiro
CREATE OR REPLACE FUNCTION public.atualizar_faturamento(
  _fatura_id uuid,
  _numero_nf text, _serie_nf text, _data_emissao date,
  _valor_bruto numeric, _valor_liquido numeric,
  _data_vencimento date, _data_prevista_recebimento date,
  _observacoes_fiscais text, _observacoes_financeiras text,
  _anexo_nf_storage_path text, _anexo_nf_nome text,
  _motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_old public.faturas; v_new_status public.faturamento_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_role := public.get_primary_role(auth.uid());
  IF v_role NOT IN ('admin','faturamento') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 3 THEN
    RAISE EXCEPTION 'Motivo é obrigatório (mínimo 3 caracteres)';
  END IF;

  SELECT * INTO v_old FROM public.faturas WHERE id = _fatura_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Faturamento não encontrado'; END IF;
  IF v_old.status = 'cancelado' THEN RAISE EXCEPTION 'Faturamento cancelado não pode ser editado'; END IF;

  UPDATE public.faturas SET
    numero_nf = _numero_nf,
    serie_nf = _serie_nf,
    data_emissao = _data_emissao,
    valor_bruto = _valor_bruto,
    valor_liquido = _valor_liquido,
    valor = COALESCE(_valor_liquido, valor),
    data_vencimento = _data_vencimento,
    data_prevista_recebimento = _data_prevista_recebimento,
    observacoes_fiscais = _observacoes_fiscais,
    observacoes_financeiras = _observacoes_financeiras,
    anexo_nf_storage_path = _anexo_nf_storage_path,
    anexo_nf_nome = _anexo_nf_nome,
    updated_at = now()
  WHERE id = _fatura_id;

  -- Recalcular status
  SELECT public._calc_status_faturamento(f.*) INTO v_new_status FROM public.faturas f WHERE id = _fatura_id;
  UPDATE public.faturas SET status = v_new_status WHERE id = _fatura_id;

  -- Log alterações de campos relevantes
  IF v_old.numero_nf IS DISTINCT FROM _numero_nf THEN
    PERFORM public._log_fatura_change(_fatura_id, v_old.medicao_id, 'EDIT', 'numero_nf', v_old.numero_nf, _numero_nf, _motivo); END IF;
  IF v_old.serie_nf IS DISTINCT FROM _serie_nf THEN
    PERFORM public._log_fatura_change(_fatura_id, v_old.medicao_id, 'EDIT', 'serie_nf', v_old.serie_nf, _serie_nf, _motivo); END IF;
  IF v_old.data_emissao IS DISTINCT FROM _data_emissao THEN
    PERFORM public._log_fatura_change(_fatura_id, v_old.medicao_id, 'EDIT', 'data_emissao', v_old.data_emissao::text, _data_emissao::text, _motivo); END IF;
  IF v_old.valor_bruto IS DISTINCT FROM _valor_bruto THEN
    PERFORM public._log_fatura_change(_fatura_id, v_old.medicao_id, 'EDIT', 'valor_bruto', v_old.valor_bruto::text, _valor_bruto::text, _motivo); END IF;
  IF v_old.valor_liquido IS DISTINCT FROM _valor_liquido THEN
    PERFORM public._log_fatura_change(_fatura_id, v_old.medicao_id, 'EDIT', 'valor_liquido', v_old.valor_liquido::text, _valor_liquido::text, _motivo); END IF;
  IF v_old.data_vencimento IS DISTINCT FROM _data_vencimento THEN
    PERFORM public._log_fatura_change(_fatura_id, v_old.medicao_id, 'EDIT', 'data_vencimento', v_old.data_vencimento::text, _data_vencimento::text, _motivo); END IF;
  IF v_old.status IS DISTINCT FROM v_new_status THEN
    PERFORM public._log_fatura_change(_fatura_id, v_old.medicao_id, 'STATUS', 'status', v_old.status::text, v_new_status::text, _motivo); END IF;
END $$;

-- 12) RPC: Registrar pagamento
CREATE OR REPLACE FUNCTION public.registrar_pagamento_faturamento(
  _fatura_id uuid,
  _data_pagamento date,
  _valor_recebido numeric,
  _motivo_diferenca text,
  _motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_old public.faturas; v_new_status public.faturamento_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_role := public.get_primary_role(auth.uid());
  IF v_role NOT IN ('admin','faturamento') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF _data_pagamento IS NULL THEN RAISE EXCEPTION 'Data de pagamento é obrigatória'; END IF;
  IF _valor_recebido IS NULL OR _valor_recebido <= 0 THEN RAISE EXCEPTION 'Valor recebido é obrigatório e deve ser maior que zero'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 3 THEN RAISE EXCEPTION 'Motivo é obrigatório'; END IF;

  SELECT * INTO v_old FROM public.faturas WHERE id = _fatura_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Faturamento não encontrado'; END IF;
  IF v_old.status = 'cancelado' THEN RAISE EXCEPTION 'Faturamento cancelado'; END IF;
  IF v_old.valor_liquido IS NULL THEN RAISE EXCEPTION 'Valor líquido da NF deve estar preenchido'; END IF;

  IF abs(COALESCE(_valor_recebido,0) - COALESCE(v_old.valor_liquido,0)) > 0.01
     AND (_motivo_diferenca IS NULL OR length(trim(_motivo_diferenca)) < 3) THEN
    RAISE EXCEPTION 'Valor recebido difere do valor líquido — informe o motivo da diferença';
  END IF;

  UPDATE public.faturas SET
    data_pagamento = _data_pagamento,
    valor_recebido = _valor_recebido,
    motivo_diferenca = _motivo_diferenca,
    updated_at = now()
  WHERE id = _fatura_id;

  SELECT public._calc_status_faturamento(f.*) INTO v_new_status FROM public.faturas f WHERE id = _fatura_id;
  UPDATE public.faturas SET status = v_new_status WHERE id = _fatura_id;

  PERFORM public._log_fatura_change(_fatura_id, v_old.medicao_id, 'PAGAMENTO', 'valor_recebido',
    v_old.valor_recebido::text, _valor_recebido::text, _motivo,
    jsonb_build_object('data_pagamento', _data_pagamento, 'motivo_diferenca', _motivo_diferenca));

  IF v_new_status = 'pago' THEN
    UPDATE public.medicoes SET status = 'paga', updated_at = now()
      WHERE id = v_old.medicao_id AND status = 'faturada';
    INSERT INTO public.medicao_status_historico (medicao_id, status_anterior, status_novo, user_id, user_email, perfil_usuario, motivo)
    SELECT v_old.medicao_id, 'faturada'::medicao_status, 'paga'::medicao_status, auth.uid(), u.email, v_role, 'Pagamento registrado'
    FROM auth.users u WHERE u.id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.medicoes WHERE id = v_old.medicao_id AND status = 'paga');
  END IF;
END $$;

-- 13) RPC: Cancelar faturamento
CREATE OR REPLACE FUNCTION public.cancelar_faturamento(_fatura_id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_old public.faturas;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_role := public.get_primary_role(auth.uid());
  IF v_role NOT IN ('admin','faturamento') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN RAISE EXCEPTION 'Motivo obrigatório (mínimo 5 caracteres)'; END IF;

  SELECT * INTO v_old FROM public.faturas WHERE id = _fatura_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Faturamento não encontrado'; END IF;
  IF v_old.status = 'pago' THEN RAISE EXCEPTION 'Faturamento já pago não pode ser cancelado'; END IF;

  UPDATE public.faturas SET status = 'cancelado', updated_at = now() WHERE id = _fatura_id;

  -- Reverter medição para aprovada_cliente
  UPDATE public.medicoes SET status = 'aprovada_cliente', updated_at = now()
    WHERE id = v_old.medicao_id AND status = 'faturada';

  PERFORM public._log_fatura_change(_fatura_id, v_old.medicao_id, 'CANCELAR', 'status',
    v_old.status::text, 'cancelado', _motivo);

  INSERT INTO public.medicao_status_historico (medicao_id, status_anterior, status_novo, user_id, user_email, perfil_usuario, motivo)
  SELECT v_old.medicao_id, 'faturada'::medicao_status, 'aprovada_cliente'::medicao_status, auth.uid(), u.email, v_role, 'Faturamento cancelado: ' || _motivo
  FROM auth.users u WHERE u.id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.medicoes WHERE id = v_old.medicao_id AND status = 'aprovada_cliente');
END $$;

-- 14) Job leve: marcar em_atraso (executado on-read pelo backend; aqui só função utilitária)
CREATE OR REPLACE FUNCTION public.atualizar_status_atraso() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  WITH upd AS (
    UPDATE public.faturas
       SET status = 'em_atraso'
     WHERE status IN ('aguardando_pagamento','nf_emitida')
       AND data_vencimento IS NOT NULL
       AND data_vencimento < CURRENT_DATE
       AND COALESCE(valor_recebido,0) = 0
    RETURNING 1
  ) SELECT count(*) INTO n FROM upd;
  RETURN n;
END $$;

-- 15) Drop enum antigo se existir e não tiver mais uso
DO $$ BEGIN
  DROP TYPE IF EXISTS public.fatura_status;
EXCEPTION WHEN dependent_objects_still_exist THEN NULL; END $$;