
CREATE TABLE public.empresa_emissora (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT NOT NULL,
  inscricao_estadual TEXT,
  inscricao_municipal TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cep TEXT,
  municipio TEXT,
  uf TEXT,
  telefone TEXT,
  email TEXT,
  banco TEXT,
  agencia TEXT,
  conta_corrente TEXT,
  chave_pix TEXT,
  logo_storage_path TEXT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  padrao BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.empresa_emissora ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_ee_read ON public.empresa_emissora FOR SELECT TO authenticated USING (true);
CREATE POLICY p_ee_write ON public.empresa_emissora FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_ee_updated_at
  BEFORE UPDATE ON public.empresa_emissora
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE UNIQUE INDEX idx_empresa_emissora_padrao
  ON public.empresa_emissora (padrao) WHERE padrao = true;

INSERT INTO public.empresa_emissora (
  razao_social, cnpj, inscricao_estadual, inscricao_municipal,
  endereco, bairro, cep, municipio, uf, telefone,
  banco, agencia, conta_corrente, padrao
) VALUES (
  'MC TERRAPLENAGEM E CONSTRUÇÕES LTDA',
  '07.299.287/0001-41', '15.247.883-3', '5344',
  'Rua Tabajara, S/N Qd 07 Lt 34', 'Resid. Parque dos Carajás',
  '68.515-000', 'Parauapebas', 'PA', '3346-6027',
  'Bradesco', '1388-9', '24.119-9', true
);

ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS empresa_emissora_id UUID REFERENCES public.empresa_emissora(id),
  ADD COLUMN IF NOT EXISTS natureza_operacao TEXT,
  ADD COLUMN IF NOT EXISTS descricao_item TEXT,
  ADD COLUMN IF NOT EXISTS codigo_item TEXT,
  ADD COLUMN IF NOT EXISTS quantidade NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC,
  ADD COLUMN IF NOT EXISTS local_servico TEXT,
  ADD COLUMN IF NOT EXISTS numero_rf TEXT,
  ADD COLUMN IF NOT EXISTS numero_contrato_cliente TEXT,
  ADD COLUMN IF NOT EXISTS numero_pedido_item TEXT,
  ADD COLUMN IF NOT EXISTS numero_frs TEXT,
  ADD COLUMN IF NOT EXISTS numero_bm TEXT,
  ADD COLUMN IF NOT EXISTS observacoes_nota TEXT,
  ADD COLUMN IF NOT EXISTS dados_bancarios TEXT,
  ADD COLUMN IF NOT EXISTS anexo_nota_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS anexo_nota_nome TEXT,
  ADD COLUMN IF NOT EXISTS nota_emitida_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nota_emitida_por UUID,
  ADD COLUMN IF NOT EXISTS motivo_valor_diferente TEXT,
  ADD COLUMN IF NOT EXISTS status_emissao_fiscal TEXT DEFAULT 'nao_emitida',
  ADD COLUMN IF NOT EXISTS protocolo_emissao TEXT,
  ADD COLUMN IF NOT EXISTS chave_verificacao TEXT,
  ADD COLUMN IF NOT EXISTS xml_nota TEXT,
  ADD COLUMN IF NOT EXISTS erro_emissao TEXT,
  ADD COLUMN IF NOT EXISTS provedor_fiscal TEXT;
