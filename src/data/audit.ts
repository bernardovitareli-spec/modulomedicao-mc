import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/queryKeys";

export interface AuditFilters {
  entidade?: string;        // "todas" ou nome
  limit?: number;
  search?: string;          // não usado na query, apenas para chave (filtra client-side)
}

export function useAuditList(filters: AuditFilters = {}) {
  const key = useMemo(
    () => qk.audit.list({ entidade: filters.entidade, limit: filters.limit }),
    [filters.entidade, filters.limit],
  );
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(filters.limit ?? 500);
      if (filters.entidade && filters.entidade !== "todas") q = q.eq("entidade", filters.entidade);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
