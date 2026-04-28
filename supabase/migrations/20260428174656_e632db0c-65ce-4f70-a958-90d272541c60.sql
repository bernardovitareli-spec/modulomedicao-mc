ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS codigo_cliente text;
CREATE INDEX IF NOT EXISTS idx_clientes_codigo_cliente ON public.clientes(codigo_cliente) WHERE codigo_cliente IS NOT NULL;