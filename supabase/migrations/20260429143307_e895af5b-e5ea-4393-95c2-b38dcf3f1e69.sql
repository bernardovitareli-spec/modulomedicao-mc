-- Permitir UPDATE no bucket medicao-anexos (necessário para upsert via storage)
CREATE POLICY "medicao_anexos_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'medicao-anexos'
  AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'gestor_contrato'::app_role, 'operacional'::app_role, 'faturamento'::app_role])
)
WITH CHECK (
  bucket_id = 'medicao-anexos'
  AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'gestor_contrato'::app_role, 'operacional'::app_role, 'faturamento'::app_role])
);