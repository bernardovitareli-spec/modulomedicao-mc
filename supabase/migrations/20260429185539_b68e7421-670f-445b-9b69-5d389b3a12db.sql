
-- 1. Novos campos
ALTER TABLE public.medicoes
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS medicao_original_id uuid,
  ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS motivo_reabertura text,
  ADD COLUMN IF NOT EXISTS motivo_substituicao text;

-- 2. Popular medicao_original_id com o próprio id quando nulo
UPDATE public.medicoes SET medicao_original_id = id WHERE medicao_original_id IS NULL;

-- 3. Índice para consulta rápida da versão ativa por chave
CREATE INDEX IF NOT EXISTS idx_medicoes_chave_ativa
  ON public.medicoes (contrato_id, competencia, periodo_inicio, periodo_fim, ativa);

CREATE INDEX IF NOT EXISTS idx_medicoes_original
  ON public.medicoes (medicao_original_id);

-- 4. Função: reabrir medição cancelada (admin)
CREATE OR REPLACE FUNCTION public.reabrir_medicao_cancelada(
  _medicao_id uuid,
  _motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status medicao_status;
  v_email text;
  v_perfil text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem reabrir medições canceladas.';
  END IF;

  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo é obrigatório (mínimo 5 caracteres).';
  END IF;

  SELECT status INTO v_status FROM public.medicoes WHERE id = _medicao_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Medição não encontrada.';
  END IF;
  IF v_status <> 'cancelada' THEN
    RAISE EXCEPTION 'Apenas medições canceladas podem ser reabertas. Status atual: %', v_status;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  v_perfil := 'admin';

  UPDATE public.medicoes
     SET status = 'rascunho',
         motivo_reabertura = _motivo,
         ativa = true,
         updated_at = now()
   WHERE id = _medicao_id;

  -- Marcar outras versões da mesma chave como inativas
  UPDATE public.medicoes m1
     SET ativa = false
   FROM public.medicoes m2
   WHERE m2.id = _medicao_id
     AND m1.contrato_id = m2.contrato_id
     AND m1.competencia = m2.competencia
     AND m1.periodo_inicio = m2.periodo_inicio
     AND m1.periodo_fim = m2.periodo_fim
     AND m1.id <> _medicao_id;

  INSERT INTO public.medicao_status_historico
    (medicao_id, status_anterior, status_novo, user_id, user_email, perfil_usuario, motivo, contexto)
  VALUES
    (_medicao_id, 'cancelada', 'rascunho', auth.uid(), v_email, v_perfil, _motivo,
     jsonb_build_object('origem', 'reabrir_medicao_cancelada'));
END;
$$;

-- 5. Função: criar nova versão de medição
CREATE OR REPLACE FUNCTION public.criar_nova_versao_medicao(
  _medicao_anterior_id uuid,
  _motivo text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anterior public.medicoes%ROWTYPE;
  v_nova_id uuid;
  v_nova_versao integer;
  v_original uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'gestor_contrato'::app_role, 'operacional'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para criar nova versão.';
  END IF;

  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo é obrigatório (mínimo 5 caracteres).';
  END IF;

  SELECT * INTO v_anterior FROM public.medicoes WHERE id = _medicao_anterior_id;
  IF v_anterior.id IS NULL THEN
    RAISE EXCEPTION 'Medição anterior não encontrada.';
  END IF;

  v_original := COALESCE(v_anterior.medicao_original_id, v_anterior.id);

  SELECT COALESCE(MAX(versao), 0) + 1
    INTO v_nova_versao
    FROM public.medicoes
   WHERE COALESCE(medicao_original_id, id) = v_original;

  -- Marcar todas as versões anteriores como inativas
  UPDATE public.medicoes
     SET ativa = false
   WHERE COALESCE(medicao_original_id, id) = v_original;

  INSERT INTO public.medicoes (
    contrato_id, competencia, periodo_inicio, periodo_fim,
    status, observacoes, created_by,
    versao, medicao_original_id, ativa, motivo_substituicao
  ) VALUES (
    v_anterior.contrato_id, v_anterior.competencia,
    v_anterior.periodo_inicio, v_anterior.periodo_fim,
    'rascunho',
    'Nova versão a partir de ' || v_anterior.id,
    auth.uid(),
    v_nova_versao, v_original, true, _motivo
  ) RETURNING id INTO v_nova_id;

  INSERT INTO public.medicao_status_historico
    (medicao_id, status_anterior, status_novo, user_id, motivo, contexto)
  VALUES
    (v_nova_id, NULL, 'rascunho', auth.uid(), _motivo,
     jsonb_build_object('origem', 'nova_versao', 'versao', v_nova_versao, 'medicao_anterior', _medicao_anterior_id));

  RETURN v_nova_id;
END;
$$;
