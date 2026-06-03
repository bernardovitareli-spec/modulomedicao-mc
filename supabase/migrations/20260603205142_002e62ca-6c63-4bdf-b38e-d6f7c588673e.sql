-- Validações de domínio espelhando os schemas zod do app.
-- Todos os CHECKs em tabelas com histórico usam NOT VALID para não bloquear dados antigos.

-- medicao_itens
ALTER TABLE public.medicao_itens
  ADD CONSTRAINT medicao_itens_horimetro_check
  CHECK (horimetro_final IS NULL OR horimetro_inicial IS NULL OR horimetro_final >= horimetro_inicial) NOT VALID;

ALTER TABLE public.medicao_itens
  ADD CONSTRAINT medicao_itens_horas_informadas_check
  CHECK (horas_informadas IS NULL OR horas_informadas >= 0) NOT VALID;

ALTER TABLE public.medicao_itens
  ADD CONSTRAINT medicao_itens_valor_hora_check
  CHECK (valor_hora IS NULL OR valor_hora > 0) NOT VALID;

-- contratos
ALTER TABLE public.contratos
  ADD CONSTRAINT contratos_periodo_check
  CHECK (termino_contrato IS NULL OR inicio_operacao IS NULL OR termino_contrato >= inicio_operacao) NOT VALID;

ALTER TABLE public.contratos
  ADD CONSTRAINT contratos_valor_global_check
  CHECK (valor_global IS NULL OR valor_global >= 0) NOT VALID;

-- contrato_equipamentos
ALTER TABLE public.contrato_equipamentos
  ADD CONSTRAINT contrato_equipamentos_periodo_check
  CHECK (data_fim IS NULL OR data_fim >= data_inicio) NOT VALID;

-- contrato_regras
ALTER TABLE public.contrato_regras
  ADD CONSTRAINT contrato_regras_vigencia_check
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio) NOT VALID;

-- faturas
ALTER TABLE public.faturas
  ADD CONSTRAINT faturas_valor_check
  CHECK (valor IS NULL OR valor > 0) NOT VALID;

ALTER TABLE public.faturas
  ADD CONSTRAINT faturas_datas_check
  CHECK (data_vencimento IS NULL OR data_emissao IS NULL OR data_vencimento >= data_emissao) NOT VALID;

-- Trigger validando CNPJ (14 dígitos) em clientes.
CREATE OR REPLACE FUNCTION public.validar_cnpj_cliente()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cnpj IS NOT NULL AND length(regexp_replace(NEW.cnpj, '\D', '', 'g')) <> 14 THEN
    RAISE EXCEPTION 'CNPJ_INVALIDO: precisa ter 14 dígitos' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_cnpj_check ON public.clientes;
CREATE TRIGGER clientes_cnpj_check
  BEFORE INSERT OR UPDATE OF cnpj ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.validar_cnpj_cliente();

-- Tradução de mensagens de constraint para PT-BR amigável.
CREATE OR REPLACE FUNCTION public.traduzir_erro_constraint(message text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF message IS NULL THEN RETURN NULL; END IF;
  IF position('medicao_itens_horimetro_check' IN message) > 0 THEN
    RETURN 'Horímetro final deve ser maior ou igual ao inicial.';
  ELSIF position('medicao_itens_horas_informadas_check' IN message) > 0 THEN
    RETURN 'Horas informadas não podem ser negativas.';
  ELSIF position('medicao_itens_valor_hora_check' IN message) > 0 THEN
    RETURN 'Valor por hora deve ser maior que zero.';
  ELSIF position('contratos_periodo_check' IN message) > 0 THEN
    RETURN 'Data de término do contrato deve ser maior ou igual à data de início.';
  ELSIF position('contratos_valor_global_check' IN message) > 0 THEN
    RETURN 'Valor global do contrato não pode ser negativo.';
  ELSIF position('contrato_equipamentos_periodo_check' IN message) > 0 THEN
    RETURN 'Data de fim do vínculo deve ser maior ou igual à data de início.';
  ELSIF position('contrato_regras_vigencia_check' IN message) > 0 THEN
    RETURN 'Vigência fim da regra deve ser maior ou igual à vigência início.';
  ELSIF position('faturas_valor_check' IN message) > 0 THEN
    RETURN 'Valor da fatura deve ser maior que zero.';
  ELSIF position('faturas_datas_check' IN message) > 0 THEN
    RETURN 'Data de vencimento deve ser maior ou igual à data de emissão.';
  ELSIF position('CNPJ_INVALIDO' IN message) > 0 THEN
    RETURN 'CNPJ inválido: precisa ter 14 dígitos.';
  ELSE
    RETURN message;
  END IF;
END;
$$;