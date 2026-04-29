
-- Cliente: campos de endereço complementares
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS endereco_complemento text;

-- Contrato: local do serviço
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS local_servico text;

-- Empresa emissora: configurações de nota
ALTER TABLE public.empresa_emissora
  ADD COLUMN IF NOT EXISTS numero_nota_digitos integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS prazo_recebimento_padrao_dias integer NOT NULL DEFAULT 30;

-- Faturas: prazo e número formatado
ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS prazo_recebimento_dias integer,
  ADD COLUMN IF NOT EXISTS numero_nota_formatado text;
