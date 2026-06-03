
-- ============================================================
-- PARTE 1: Vínculo usuário × cliente (multi-tenant)
-- ============================================================

CREATE TABLE public.user_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (user_id, cliente_id)
);
COMMENT ON TABLE public.user_clientes IS 'Vínculo N:N entre usuários do perfil visualizacao e clientes que eles podem acessar.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_clientes TO authenticated;
GRANT ALL ON public.user_clientes TO service_role;

ALTER TABLE public.user_clientes ENABLE ROW LEVEL SECURITY;

-- Usuário enxerga seus próprios vínculos; admin enxerga tudo
CREATE POLICY "uc_read" ON public.user_clientes FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Apenas admin gerencia vínculos
CREATE POLICY "uc_admin_all" ON public.user_clientes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Função que define se um usuário pode ler dados de um cliente
CREATE OR REPLACE FUNCTION public.user_has_cliente_access(_uid uuid, _cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Perfis internos veem todos os clientes
  SELECT public.has_any_role(_uid, ARRAY['admin','gestor_contrato','operacional','faturamento']::app_role[])
      OR EXISTS (SELECT 1 FROM public.user_clientes WHERE user_id = _uid AND cliente_id = _cliente_id);
$$;
COMMENT ON FUNCTION public.user_has_cliente_access(uuid, uuid) IS 'Retorna true se o usuário tem papel interno OU vínculo explícito ao cliente.';

-- ============================================================
-- PARTE 2: Aprovação de cadastro
-- ============================================================

CREATE TABLE public.user_aprovacoes_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado')),
  motivo_rejeicao text,
  decidido_em timestamptz,
  decidido_por uuid REFERENCES auth.users(id)
);
COMMENT ON TABLE public.user_aprovacoes_pendentes IS 'Fila de novos cadastros aguardando decisão do administrador.';

GRANT SELECT, INSERT, UPDATE ON public.user_aprovacoes_pendentes TO authenticated;
GRANT ALL ON public.user_aprovacoes_pendentes TO service_role;

ALTER TABLE public.user_aprovacoes_pendentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uap_admin_select" ON public.user_aprovacoes_pendentes FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "uap_admin_update" ON public.user_aprovacoes_pendentes FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Substitui handle_new_user: primeiro cadastro vira admin; demais ficam pendentes (sem papel)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    -- Primeiro usuário do sistema vira admin automaticamente
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    -- Novos cadastros entram na fila de aprovação SEM papel
    INSERT INTO public.user_aprovacoes_pendentes (user_id, email, status)
    VALUES (NEW.id, NEW.email, 'pendente')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- RPC: aprovar cadastro pendente
CREATE OR REPLACE FUNCTION public.admin_aprovar_usuario(_user_id uuid, _role app_role, _cliente_ids uuid[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administrador pode aprovar cadastros';
  END IF;

  -- Define o papel do usuário
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);

  -- Para visualização, vincula clientes informados
  IF _role = 'visualizacao' AND _cliente_ids IS NOT NULL THEN
    FOREACH v_cid IN ARRAY _cliente_ids LOOP
      INSERT INTO public.user_clientes (user_id, cliente_id, created_by)
      VALUES (_user_id, v_cid, auth.uid())
      ON CONFLICT (user_id, cliente_id) DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.user_aprovacoes_pendentes
     SET status = 'aprovado', decidido_em = now(), decidido_por = auth.uid()
   WHERE user_id = _user_id;
END;
$$;

-- RPC: rejeitar cadastro (apaga o usuário)
CREATE OR REPLACE FUNCTION public.admin_rejeitar_usuario(_user_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administrador pode rejeitar cadastros';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 3 THEN
    RAISE EXCEPTION 'Motivo da rejeição é obrigatório';
  END IF;

  UPDATE public.user_aprovacoes_pendentes
     SET status = 'rejeitado', motivo_rejeicao = _motivo, decidido_em = now(), decidido_por = auth.uid()
   WHERE user_id = _user_id;

  -- ON DELETE CASCADE limpa user_roles, user_clientes e demais vínculos
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

-- RPC auxiliar para o admin listar pendentes (sem depender da view do admin_list_users)
CREATE OR REPLACE FUNCTION public.admin_list_pendentes()
RETURNS TABLE(user_id uuid, email text, solicitado_em timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administrador';
  END IF;
  RETURN QUERY
    SELECT p.user_id, p.email, p.solicitado_em
      FROM public.user_aprovacoes_pendentes p
     WHERE p.status = 'pendente'
     ORDER BY p.solicitado_em DESC;
END;
$$;

-- RPC para listar clientes vinculados a um usuário
CREATE OR REPLACE FUNCTION public.admin_list_user_clientes(_user_id uuid)
RETURNS TABLE(cliente_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administrador';
  END IF;
  RETURN QUERY SELECT uc.cliente_id FROM public.user_clientes uc WHERE uc.user_id = _user_id;
END;
$$;

-- RPC para substituir o conjunto de clientes vinculados a um usuário
CREATE OR REPLACE FUNCTION public.admin_set_user_clientes(_user_id uuid, _cliente_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administrador';
  END IF;
  DELETE FROM public.user_clientes WHERE user_id = _user_id;
  IF _cliente_ids IS NOT NULL THEN
    FOREACH v_cid IN ARRAY _cliente_ids LOOP
      INSERT INTO public.user_clientes (user_id, cliente_id, created_by)
      VALUES (_user_id, v_cid, auth.uid())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END;
$$;

-- ============================================================
-- PARTE 3: Reescrever políticas de leitura (multi-tenant)
-- ============================================================

-- clientes
DROP POLICY IF EXISTS "p_read" ON public.clientes;
CREATE POLICY "p_read_multitenant" ON public.clientes FOR SELECT
  USING (public.user_has_cliente_access(auth.uid(), id));
COMMENT ON POLICY "p_read_multitenant" ON public.clientes IS 'Perfis internos veem todos; visualização só vê clientes vinculados.';

-- contratos
DROP POLICY IF EXISTS "p_read" ON public.contratos;
CREATE POLICY "p_read_multitenant" ON public.contratos FOR SELECT
  USING (public.user_has_cliente_access(auth.uid(), cliente_id));

-- contrato_equipamentos
DROP POLICY IF EXISTS "p_read" ON public.contrato_equipamentos;
CREATE POLICY "p_read_multitenant" ON public.contrato_equipamentos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = contrato_id AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
  ));

-- contrato_regras
DROP POLICY IF EXISTS "p_read" ON public.contrato_regras;
CREATE POLICY "p_read_multitenant" ON public.contrato_regras FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = contrato_id AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
  ));

-- contrato_alteracoes
DROP POLICY IF EXISTS "p_read" ON public.contrato_alteracoes;
CREATE POLICY "p_read_multitenant" ON public.contrato_alteracoes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = contrato_id AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
  ));

-- importacoes: somente perfis internos
DROP POLICY IF EXISTS "p_read" ON public.importacoes;
CREATE POLICY "p_read_multitenant" ON public.importacoes FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional','faturamento']::app_role[]));

-- medicoes
DROP POLICY IF EXISTS "p_read" ON public.medicoes;
CREATE POLICY "p_read_multitenant" ON public.medicoes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = contrato_id AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
  ));

-- medicao_itens
DROP POLICY IF EXISTS "p_read" ON public.medicao_itens;
CREATE POLICY "p_read_multitenant" ON public.medicao_itens FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.medicoes m
    JOIN public.contratos c ON c.id = m.contrato_id
    WHERE m.id = medicao_id AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
  ));

-- aprovacoes
DROP POLICY IF EXISTS "p_read" ON public.aprovacoes;
CREATE POLICY "p_read_multitenant" ON public.aprovacoes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.medicoes m
    JOIN public.contratos c ON c.id = m.contrato_id
    WHERE m.id = medicao_id AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
  ));

-- faturas
DROP POLICY IF EXISTS "p_read" ON public.faturas;
CREATE POLICY "p_read_multitenant" ON public.faturas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.medicoes m
    JOIN public.contratos c ON c.id = m.contrato_id
    WHERE m.id = medicao_id AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
  ));

-- medicao_anexos
DROP POLICY IF EXISTS "anexos_read" ON public.medicao_anexos;
CREATE POLICY "anexos_read_multitenant" ON public.medicao_anexos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.medicoes m
    JOIN public.contratos c ON c.id = m.contrato_id
    WHERE m.id = medicao_id AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
  ));

-- equipamentos: perfis internos veem todos; visualização só os usados em contratos dos seus clientes
DROP POLICY IF EXISTS "p_read" ON public.equipamentos;
CREATE POLICY "p_read_multitenant" ON public.equipamentos FOR SELECT
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional','faturamento']::app_role[])
    OR EXISTS (
      SELECT 1 FROM public.contrato_equipamentos ce
      JOIN public.contratos c ON c.id = ce.contrato_id
      WHERE ce.equipamento_id = equipamentos.id
        AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
    )
  );

-- audit_log: admin/gestor veem tudo; demais veem apenas suas próprias ações
DROP POLICY IF EXISTS "p_read" ON public.audit_log;
CREATE POLICY "p_read_multitenant" ON public.audit_log FOR SELECT
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::app_role[])
    OR user_id = auth.uid()
  );

-- ============================================================
-- PARTE 4: Storage do bucket medicao-anexos
-- ============================================================

DROP POLICY IF EXISTS "medicao_anexos_read" ON storage.objects;
CREATE POLICY "medicao_anexos_read_multitenant" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'medicao-anexos'
    AND EXISTS (
      SELECT 1 FROM public.medicoes m
      JOIN public.contratos c ON c.id = m.contrato_id
      WHERE m.id::text = split_part(name, '/', 1)
        AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
    )
  );

DROP POLICY IF EXISTS "medicao_anexos_insert" ON storage.objects;
CREATE POLICY "medicao_anexos_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'medicao-anexos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional','faturamento']::app_role[])
    AND EXISTS (
      SELECT 1 FROM public.medicoes m
      JOIN public.contratos c ON c.id = m.contrato_id
      WHERE m.id::text = split_part(name, '/', 1)
        AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
    )
  );

DROP POLICY IF EXISTS "medicao_anexos_update" ON storage.objects;
CREATE POLICY "medicao_anexos_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'medicao-anexos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional','faturamento']::app_role[])
  )
  WITH CHECK (
    bucket_id = 'medicao-anexos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional','faturamento']::app_role[])
  );

DROP POLICY IF EXISTS "medicao_anexos_delete" ON storage.objects;
CREATE POLICY "medicao_anexos_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'medicao-anexos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (
        owner = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.medicoes m
          JOIN public.contratos c ON c.id = m.contrato_id
          WHERE m.id::text = split_part(name, '/', 1)
            AND public.user_has_cliente_access(auth.uid(), c.cliente_id)
        )
      )
    )
  );

-- ============================================================
-- Backfill: usuários sem papel viram pendentes
-- ============================================================
INSERT INTO public.user_aprovacoes_pendentes (user_id, email, status)
SELECT u.id, u.email, 'pendente'
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM public.user_aprovacoes_pendentes p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;
