-- Tabela de anexos da medição
CREATE TABLE IF NOT EXISTS public.medicao_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('comprovante_envio','boletim_assinado','nf','outro')),
  nome_arquivo TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  tamanho_bytes BIGINT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  user_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_medicao_anexos_medicao ON public.medicao_anexos(medicao_id);

ALTER TABLE public.medicao_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anexos_read" ON public.medicao_anexos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "anexos_insert" ON public.medicao_anexos
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'gestor_contrato'::app_role,'operacional'::app_role,'faturamento'::app_role]));

CREATE POLICY "anexos_delete_admin_owner" ON public.medicao_anexos
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR created_by = auth.uid());

-- Bucket privado de anexos
INSERT INTO storage.buckets (id, name, public)
VALUES ('medicao-anexos', 'medicao-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Policies de storage: caminho = {medicao_id}/{tipo}/{filename}
CREATE POLICY "medicao_anexos_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'medicao-anexos');

CREATE POLICY "medicao_anexos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'medicao-anexos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role,'gestor_contrato'::app_role,'operacional'::app_role,'faturamento'::app_role])
  );

CREATE POLICY "medicao_anexos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'medicao-anexos'
    AND (has_role(auth.uid(),'admin'::app_role) OR owner = auth.uid())
  );