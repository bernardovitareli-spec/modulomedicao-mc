-- 1) Adicionar campos de fornecedor/locadora em contratos
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS fornecedor_nome text,
  ADD COLUMN IF NOT EXISTS fornecedor_codigo text,
  ADD COLUMN IF NOT EXISTS fornecedor_cnpj text;

-- 2) Garantir cliente "Construtora Ápia"
INSERT INTO public.clientes (razao_social, nome_fantasia, status)
SELECT 'Construtora Ápia', 'Ápia', 'ativo'::cliente_status
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes
  WHERE upper(razao_social) IN ('CONSTRUTORA ÁPIA','CONSTRUTORA APIA')
);

-- 3) Migrar contratos cujo cliente atual é MC TERRAPLANAGEM
DO $$
DECLARE
  v_mc_id uuid;
  v_apia_id uuid;
  v_mc_nome text;
  v_mc_codigo text;
  v_mc_cnpj text;
BEGIN
  SELECT id, razao_social, codigo_cliente, cnpj
    INTO v_mc_id, v_mc_nome, v_mc_codigo, v_mc_cnpj
  FROM public.clientes
  WHERE upper(razao_social) = 'MC TERRAPLANAGEM E CONSTRUCOES LTDA'
  LIMIT 1;

  SELECT id INTO v_apia_id FROM public.clientes
  WHERE upper(razao_social) IN ('CONSTRUTORA ÁPIA','CONSTRUTORA APIA') LIMIT 1;

  IF v_mc_id IS NOT NULL AND v_apia_id IS NOT NULL THEN
    UPDATE public.contratos
       SET cliente_id = v_apia_id,
           fornecedor_nome   = COALESCE(fornecedor_nome, v_mc_nome),
           fornecedor_codigo = COALESCE(fornecedor_codigo, v_mc_codigo),
           fornecedor_cnpj   = COALESCE(fornecedor_cnpj, v_mc_cnpj)
     WHERE cliente_id = v_mc_id;

    -- Remove MC da tabela de clientes (vira somente fornecedor)
    DELETE FROM public.clientes WHERE id = v_mc_id;
  END IF;
END $$;