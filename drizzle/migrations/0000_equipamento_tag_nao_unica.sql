ALTER TABLE public.equipamentos DROP CONSTRAINT IF EXISTS equipamentos_tag_key;
CREATE INDEX IF NOT EXISTS equipamentos_tag_idx ON public.equipamentos (tag);
CREATE INDEX IF NOT EXISTS equipamentos_serie_norm_idx ON public.equipamentos ((upper(regexp_replace(coalesce(serie,''), '[^A-Za-z0-9]', '', 'g'))));
COMMENT ON COLUMN public.equipamentos.tag IS 'Apelido operacional; pode repetir. Identificação oficial é a serie (série/placa).';