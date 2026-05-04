ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_numero_dj_key;
DROP INDEX IF EXISTS public.contratos_numero_dj_key;

CREATE UNIQUE INDEX IF NOT EXISTS contratos_cliente_numero_centro_key
ON public.contratos (cliente_id, numero_dj, COALESCE(centro_custo, ''));