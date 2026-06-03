import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/queryKeys";
import { notify } from "@/lib/notify";

export interface MedicoesFilters {
  status?: string; // "todos" ou status concreto
  versao?: "ativas" | "todas" | "inativas" | "canceladas";
}

export function useMedicoesList(filters: MedicoesFilters = {}) {
  const key = useMemo(() => qk.medicoes.list(filters), [filters.status, filters.versao]);
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase
        .from("medicoes")
        .select("*, contratos(numero_dj, clientes(razao_social))")
        .order("competencia", { ascending: false });
      if (filters.status && filters.status !== "todos") q = q.eq("status", filters.status as never);
      if (filters.versao === "ativas") q = q.eq("ativa", true);
      else if (filters.versao === "inativas") q = q.eq("ativa", false);
      else if (filters.versao === "canceladas") q = q.eq("status", "cancelada" as never);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMedicoesVersionCounts() {
  return useQuery({
    queryKey: qk.medicoes.versionCounts,
    queryFn: async () => {
      const { data, error } = await supabase.from("medicoes").select("id, medicao_original_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m) => {
        const k = m.medicao_original_id ?? m.id;
        counts[k] = (counts[k] ?? 0) + 1;
      });
      return counts;
    },
  });
}

export function useMedicao(id?: string) {
  return useQuery({
    queryKey: qk.medicoes.byId(id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicoes")
        .select("*, contratos(numero_dj, tipo_servico, centro_custo, fornecedor_nome, fornecedor_codigo, fornecedor_cnpj, clientes(razao_social, cnpj))")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useMedicaoItens(id?: string) {
  return useQuery({
    queryKey: qk.medicoes.itens(id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicao_itens")
        .select("*, equipamentos(tag, tipo, modelo)")
        .eq("medicao_id", id!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });
}

export function useMedicaoVersoes(originalId?: string) {
  return useQuery({
    queryKey: qk.medicoes.versoes(originalId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicoes")
        .select("id, versao, status, ativa, valor_final, created_at, arquivo_origem, motivo_reimportacao")
        .or(`id.eq.${originalId},medicao_original_id.eq.${originalId}`)
        .order("versao", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!originalId,
  });
}

// --- Mutations ---

function invalidateMedicao(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: qk.medicoes.all });
  if (id) qc.invalidateQueries({ queryKey: qk.medicoes.byId(id) });
}

export function useDeletarMedicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("delete_medicao_safe", { _medicao_id: id, _motivo: motivo });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { invalidateMedicao(qc, v.id); notify.success("Medição excluída"); },
    onError: (e: Error) => notify.error(e.message),
  });
}

export function useCancelarMedicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("cancel_medicao", { _medicao_id: id, _motivo: motivo });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { invalidateMedicao(qc, v.id); notify.success("Medição cancelada"); },
    onError: (e: Error) => notify.error(e.message),
  });
}

export function useReabrirMedicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("reabrir_medicao_cancelada", {
        _medicao_id: id,
        _motivo: motivo,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { invalidateMedicao(qc, v.id); notify.success("Medição reaberta como rascunho"); },
    onError: (e: Error) => notify.error(e.message),
  });
}
