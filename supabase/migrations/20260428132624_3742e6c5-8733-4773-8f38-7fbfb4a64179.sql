
-- ========== ENUMS ==========
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor_contrato', 'operacional', 'faturamento', 'visualizacao');
CREATE TYPE public.cliente_status AS ENUM ('ativo', 'inativo');
CREATE TYPE public.equipamento_status AS ENUM ('ativo', 'manutencao', 'inativo');
CREATE TYPE public.contrato_status AS ENUM ('rascunho', 'ativo', 'suspenso', 'encerrado');
CREATE TYPE public.regra_tipo AS ENUM (
  'valor_hora','garantia_minima','desconto_horas_mecanicas','desconto_horas_paradas',
  'periodo_chuvoso','excecao_chuvoso','complementar','desconto','glosa','aditivo_contratual'
);
CREATE TYPE public.medicao_status AS ENUM ('rascunho','revisao_tecnica','aprovada','faturada','rejeitada','contestada');
CREATE TYPE public.aprovacao_etapa AS ENUM ('revisao_tecnica','aprovacao_gerencial');
CREATE TYPE public.aprovacao_resultado AS ENUM ('aprovado','rejeitado','ajuste_solicitado');
CREATE TYPE public.fatura_status AS ENUM ('pendente','emitida','paga','cancelada');

-- ========== USER ROLES ==========
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Auto-grant first signup as admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'visualizacao');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========== UPDATED AT HELPER ==========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ========== CLIENTES ==========
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  nome_fantasia text,
  cnpj text NOT NULL UNIQUE,
  inscricao_estadual text,
  endereco text,
  cidade text,
  uf text,
  cep text,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  observacoes text,
  status public.cliente_status NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== EQUIPAMENTOS ==========
CREATE TABLE public.equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  modelo text NOT NULL,
  serie text,
  tag text NOT NULL UNIQUE,
  ano int,
  status public.equipamento_status NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_equipamentos_updated BEFORE UPDATE ON public.equipamentos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== CONTRATOS ==========
CREATE TABLE public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  numero_dj text NOT NULL,
  tipo_servico text NOT NULL,
  centro_custo text,
  inicio_operacao date NOT NULL,
  termino_contrato date NOT NULL,
  valor_global numeric(14,2),
  valor_hora_padrao numeric(12,2),
  garantia_minima_horas numeric(10,2),
  status public.contrato_status NOT NULL DEFAULT 'rascunho',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (numero_dj)
);
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_contratos_updated BEFORE UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_contratos_cliente ON public.contratos(cliente_id);

-- ========== CONTRATO_EQUIPAMENTOS ==========
CREATE TABLE public.contrato_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  equipamento_id uuid NOT NULL REFERENCES public.equipamentos(id) ON DELETE RESTRICT,
  data_inicio date NOT NULL,
  data_fim date,
  horimetro_inicial numeric(12,2) DEFAULT 0,
  valor_hora_override numeric(12,2),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_id, equipamento_id, data_inicio)
);
ALTER TABLE public.contrato_equipamentos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ce_contrato ON public.contrato_equipamentos(contrato_id);

-- ========== CONTRATO_REGRAS (versionadas por vigência) ==========
CREATE TABLE public.contrato_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  tipo public.regra_tipo NOT NULL,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativa boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.contrato_regras ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_regras_contrato ON public.contrato_regras(contrato_id, tipo, vigencia_inicio);

-- ========== CONTRATO_ALTERACOES ==========
CREATE TABLE public.contrato_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_aditivo text,
  descricao text NOT NULL,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  impacto_valor numeric(14,2),
  impacto_prazo_dias int,
  detalhes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.contrato_alteracoes ENABLE ROW LEVEL SECURITY;

-- ========== IMPORTACOES ==========
CREATE TABLE public.importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_nome text NOT NULL,
  competencia date NOT NULL,
  total_linhas int NOT NULL DEFAULT 0,
  linhas_validas int NOT NULL DEFAULT 0,
  linhas_erro int NOT NULL DEFAULT 0,
  resumo jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;

-- ========== MEDICOES ==========
CREATE TABLE public.medicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE RESTRICT,
  competencia date NOT NULL,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  status public.medicao_status NOT NULL DEFAULT 'rascunho',
  total_horas_informadas numeric(12,2) NOT NULL DEFAULT 0,
  total_horas_liquidas numeric(12,2) NOT NULL DEFAULT 0,
  total_horas_pagar numeric(12,2) NOT NULL DEFAULT 0,
  valor_bruto numeric(14,2) NOT NULL DEFAULT 0,
  valor_complementares numeric(14,2) NOT NULL DEFAULT 0,
  valor_descontos numeric(14,2) NOT NULL DEFAULT 0,
  valor_glosas numeric(14,2) NOT NULL DEFAULT 0,
  valor_aditivos numeric(14,2) NOT NULL DEFAULT 0,
  valor_final numeric(14,2) NOT NULL DEFAULT 0,
  observacoes text,
  importacao_id uuid REFERENCES public.importacoes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (contrato_id, competencia)
);
ALTER TABLE public.medicoes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_medicoes_updated BEFORE UPDATE ON public.medicoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_medicoes_contrato_comp ON public.medicoes(contrato_id, competencia);

-- ========== MEDICAO_ITENS ==========
CREATE TABLE public.medicao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id uuid NOT NULL REFERENCES public.medicoes(id) ON DELETE CASCADE,
  equipamento_id uuid NOT NULL REFERENCES public.equipamentos(id) ON DELETE RESTRICT,
  contrato_equipamento_id uuid REFERENCES public.contrato_equipamentos(id) ON DELETE SET NULL,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  horimetro_inicial numeric(12,2) DEFAULT 0,
  horimetro_final numeric(12,2) DEFAULT 0,
  horas_informadas numeric(12,2) NOT NULL DEFAULT 0,
  horas_mecanicas numeric(12,2) NOT NULL DEFAULT 0,
  horas_paradas numeric(12,2) NOT NULL DEFAULT 0,
  horas_chuvoso numeric(12,2) NOT NULL DEFAULT 0,
  horas_excecao_chuvoso numeric(12,2) NOT NULL DEFAULT 0,
  horas_descontaveis numeric(12,2) NOT NULL DEFAULT 0,
  horas_liquidas numeric(12,2) NOT NULL DEFAULT 0,
  garantia_minima numeric(12,2) NOT NULL DEFAULT 0,
  horas_a_pagar numeric(12,2) NOT NULL DEFAULT 0,
  valor_hora numeric(12,2) NOT NULL DEFAULT 0,
  valor_bruto numeric(14,2) NOT NULL DEFAULT 0,
  valor_complementares numeric(14,2) NOT NULL DEFAULT 0,
  valor_descontos numeric(14,2) NOT NULL DEFAULT 0,
  valor_glosas numeric(14,2) NOT NULL DEFAULT 0,
  valor_aditivos numeric(14,2) NOT NULL DEFAULT 0,
  valor_final numeric(14,2) NOT NULL DEFAULT 0,
  regras_aplicadas jsonb DEFAULT '[]'::jsonb,
  memoria_calculo jsonb DEFAULT '{}'::jsonb,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.medicao_itens ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_medicao_itens_updated BEFORE UPDATE ON public.medicao_itens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_medicao_itens_medicao ON public.medicao_itens(medicao_id);

-- ========== APROVACOES ==========
CREATE TABLE public.aprovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id uuid NOT NULL REFERENCES public.medicoes(id) ON DELETE CASCADE,
  etapa public.aprovacao_etapa NOT NULL,
  resultado public.aprovacao_resultado NOT NULL,
  comentario text,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.aprovacoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_aprovacoes_medicao ON public.aprovacoes(medicao_id);

-- ========== FATURAS ==========
CREATE TABLE public.faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id uuid NOT NULL UNIQUE REFERENCES public.medicoes(id) ON DELETE RESTRICT,
  numero_nf text,
  data_emissao date,
  data_vencimento date,
  data_pagamento date,
  valor numeric(14,2) NOT NULL,
  status public.fatura_status NOT NULL DEFAULT 'pendente',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_faturas_updated BEFORE UPDATE ON public.faturas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== AUDIT LOG ==========
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade text NOT NULL,
  entidade_id uuid,
  acao text NOT NULL,
  dados_antes jsonb,
  dados_depois jsonb,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_entidade ON public.audit_log(entidade, entidade_id);

-- ========== POLÍTICAS RLS ==========
-- Permissões: leitura para todos autenticados; escrita conforme role.

-- helper macro: read all
CREATE POLICY p_read ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.equipamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.contratos FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.contrato_equipamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.contrato_regras FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.contrato_alteracoes FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.importacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.medicoes FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.medicao_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.aprovacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.faturas FOR SELECT TO authenticated USING (true);
CREATE POLICY p_read ON public.audit_log FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]));

-- escrita: admin + gestor_contrato em cadastros e contratos
CREATE POLICY p_write ON public.clientes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]));
CREATE POLICY p_write ON public.equipamentos FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]));
CREATE POLICY p_write ON public.contratos FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]));
CREATE POLICY p_write ON public.contrato_equipamentos FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]));
CREATE POLICY p_write ON public.contrato_regras FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]));
CREATE POLICY p_write ON public.contrato_alteracoes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato']::public.app_role[]));

-- importacoes e medicoes: admin, gestor_contrato, operacional
CREATE POLICY p_write ON public.importacoes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional']::public.app_role[]));
CREATE POLICY p_write ON public.medicoes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional']::public.app_role[]));
CREATE POLICY p_write ON public.medicao_itens FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional']::public.app_role[]));

-- aprovacoes: admin + gestor_contrato + operacional (para etapa técnica)
CREATE POLICY p_write ON public.aprovacoes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gestor_contrato','operacional']::public.app_role[]));

-- faturas: admin + faturamento
CREATE POLICY p_write ON public.faturas FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','faturamento']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','faturamento']::public.app_role[]));

-- audit_log: insert por qualquer authenticated (via triggers/app), update/delete bloqueado
CREATE POLICY p_audit_insert ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ========== TRIGGER DE AUDIT ==========
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entidade text := TG_TABLE_NAME;
  v_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := (row_to_json(OLD)->>'id')::uuid;
    INSERT INTO public.audit_log(entidade,entidade_id,acao,dados_antes,user_id)
      VALUES (v_entidade, v_id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_id := (row_to_json(NEW)->>'id')::uuid;
    INSERT INTO public.audit_log(entidade,entidade_id,acao,dados_antes,dados_depois,user_id)
      VALUES (v_entidade, v_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSE
    v_id := (row_to_json(NEW)->>'id')::uuid;
    INSERT INTO public.audit_log(entidade,entidade_id,acao,dados_depois,user_id)
      VALUES (v_entidade, v_id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER audit_clientes AFTER INSERT OR UPDATE OR DELETE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_contratos AFTER INSERT OR UPDATE OR DELETE ON public.contratos FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_regras AFTER INSERT OR UPDATE OR DELETE ON public.contrato_regras FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_alteracoes AFTER INSERT OR UPDATE OR DELETE ON public.contrato_alteracoes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_medicoes AFTER INSERT OR UPDATE OR DELETE ON public.medicoes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_aprovacoes AFTER INSERT OR UPDATE OR DELETE ON public.aprovacoes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_faturas AFTER INSERT OR UPDATE OR DELETE ON public.faturas FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
