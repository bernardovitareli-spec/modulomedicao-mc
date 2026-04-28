
-- Novos tipos de regra
ALTER TYPE public.regra_tipo ADD VALUE IF NOT EXISTS 'desconto_manual';
ALTER TYPE public.regra_tipo ADD VALUE IF NOT EXISTS 'regra_personalizada';

-- Equipamento opcional + flag ativa
ALTER TABLE public.contrato_regras
  ADD COLUMN IF NOT EXISTS equipamento_id uuid REFERENCES public.equipamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_regras_contrato_eq
  ON public.contrato_regras(contrato_id, equipamento_id, tipo, vigencia_inicio);
