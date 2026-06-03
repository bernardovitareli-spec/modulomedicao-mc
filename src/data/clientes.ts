import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/queryKeys";
import { notify } from "@/lib/notify";

export function useClientesList() {
  return useQuery({
    queryKey: qk.clientes.list(),
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useClientesAtivos() {
  return useQuery({
    queryKey: qk.clientes.ativos,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social")
        .eq("status", "ativo")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCliente(id?: string) {
  return useQuery({
    queryKey: qk.clientes.byId(id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useSalvarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: Record<string, unknown> }) => {
      const r = id
        ? await supabase.from("clientes").update(payload as never).eq("id", id)
        : await supabase.from("clientes").insert(payload as never);
      if (r.error) throw r.error;
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.clientes.all });
      notify.success("Cliente salvo");
    },
    onError: (e: Error) => notify.error(e.message),
  });
}
