import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/queryKeys";
import { notify } from "@/lib/notify";

export function useEquipamentosList() {
  return useQuery({
    queryKey: qk.equipamentos.list(),
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("*").order("tag");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarEquipamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: Record<string, unknown> }) => {
      const r = id
        ? await supabase.from("equipamentos").update(payload as never).eq("id", id)
        : await supabase.from("equipamentos").insert(payload as never);
      if (r.error) throw r.error;
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.equipamentos.all });
      notify.success("Equipamento salvo");
    },
    onError: (e: Error) => notify.error(e.message),
  });
}
