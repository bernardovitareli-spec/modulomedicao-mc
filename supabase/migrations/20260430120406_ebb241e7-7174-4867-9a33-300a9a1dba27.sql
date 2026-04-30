-- 1. Remover unique constraint que impede múltiplas versões da mesma medição
ALTER TABLE public.medicoes DROP CONSTRAINT IF EXISTS medicoes_contrato_id_competencia_key;

-- Garantir apenas UMA versão ATIVA por chave (contrato + competência + período)
CREATE UNIQUE INDEX IF NOT EXISTS uq_medicoes_chave_ativa
  ON public.medicoes (contrato_id, competencia, periodo_inicio, periodo_fim)
  WHERE ativa = true;

-- 2. Novos campos para rastrear reimportação
ALTER TABLE public.medicoes
  ADD COLUMN IF NOT EXISTS motivo_reimportacao text,
  ADD COLUMN IF NOT EXISTS origem_reimportacao text,
  ADD COLUMN IF NOT EXISTS arquivo_origem text;

-- 3. Atualizar função criar_nova_versao_medicao para aceitar arquivo de origem
CREATE OR REPLACE FUNCTION public.criar_nova_versao_medicao(
  _medicao_anterior_id uuid,
  _motivo text,
  _arquivo_origem text DEFAULT NULL,
  _origem text DEFAULT 'reimportacao'
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
  v_email text;
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

  -- Inativar todas as versões anteriores da mesma cadeia
  UPDATE public.medicoes
     SET ativa = false
   WHERE COALESCE(medicao_original_id, id) = v_original;

  INSERT INTO public.medicoes (
    contrato_id, competencia, periodo_inicio, periodo_fim,
    status, observacoes, created_by,
    versao, medicao_original_id, ativa,
    motivo_substituicao, motivo_reimportacao, origem_reimportacao, arquivo_origem
  ) VALUES (
    v_anterior.contrato_id, v_anterior.competencia,
    v_anterior.periodo_inicio, v_anterior.periodo_fim,
    'rascunho',
    'Nova versão criada a partir de reimportação de arquivo corrigido. Versão anterior: ' || v_anterior.id,
    auth.uid(),
    v_nova_versao, v_original, true,
    _motivo, _motivo, _origem, _arquivo_origem
  ) RETURNING id INTO v_nova_id;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.medicao_status_historico
    (medicao_id, status_anterior, status_novo, user_id, user_email, motivo, contexto)
  VALUES
    (v_nova_id, NULL, 'rascunho', auth.uid(), v_email,
     'Nova versão criada a partir de reimportação de arquivo corrigido.',
     jsonb_build_object(
       'origem', COALESCE(_origem, 'reimportacao'),
       'versao', v_nova_versao,
       'medicao_anterior', _medicao_anterior_id,
       'arquivo_origem', _arquivo_origem,
       'motivo', _motivo
     ));

  RETURN v_nova_id;
END;
$$;