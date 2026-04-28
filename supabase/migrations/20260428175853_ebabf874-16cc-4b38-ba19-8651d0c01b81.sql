ALTER TABLE public.clientes ALTER COLUMN cnpj DROP NOT NULL;
UPDATE public.clientes SET cnpj = NULL WHERE cnpj LIKE 'IMPORT-%';