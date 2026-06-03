import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/queryKeys";
import { notify } from "@/lib/notify";

export function useContratosList() {
  return useQuery({
    queryKey: qk.contratos.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select("*, clientes(razao_social)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContrato(id?: string) {
  return useQuery({
    queryKey: qk.contratos.byId(id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select("*, clientes(razao_social, cnpj)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCriarContrato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("contratos")
        .insert(payload as never)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.contratos.all });
      notify.success("Contrato criado");
    },
    onError: (e: Error) => notify.error(e.message),
  });
}
