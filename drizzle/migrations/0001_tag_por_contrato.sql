ALTER TABLE public.contrato_equipamentos ADD COLUMN IF NOT EXISTS tag_contrato text;
UPDATE public.contrato_equipamentos ce SET tag_contrato = e.tag FROM public.equipamentos e WHERE e.id = ce.equipamento_id AND ce.tag_contrato IS NULL;
COMMENT ON COLUMN public.contrato_equipamentos.tag_contrato IS 'Tag operacional usada pelo equipamento neste contrato (a tag pode variar entre contratos).';