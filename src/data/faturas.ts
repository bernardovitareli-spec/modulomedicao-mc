import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/queryKeys";
import { notify } from "@/lib/notify";

export function useFaturasList() {
  return useQuery({
    queryKey: qk.faturas.list(),
    queryFn: async () => {
      // Atualiza atrasos antes de listar
      try { await supabase.rpc("atualizar_status_atraso"); } catch { /* ignora */ }
      const { data, error } = await supabase
        .from("faturas")
        .select("*, medicoes(competencia, periodo_inicio, periodo_fim, valor_final, contratos(numero_dj, fornecedor_nome, clientes(razao_social)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFatura(id?: string) {
  return useQuery({
    queryKey: qk.faturas.byId(id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faturas")
        .select("*, medicoes(competencia, periodo_inicio, periodo_fim, valor_final, contratos(numero_dj, fornecedor_nome, fornecedor_cnpj, clientes(razao_social, cnpj)))")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useFaturaHistorico(id?: string) {
  return useQuery({
    queryKey: qk.faturas.historico(id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faturamento_historico")
        .select("*")
        .eq("fatura_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });
}

const invalFatura = (qc: ReturnType<typeof useQueryClient>, id?: string) => {
  qc.invalidateQueries({ queryKey: qk.faturas.all });
  if (id) {
    qc.invalidateQueries({ queryKey: qk.faturas.byId(id) });
    qc.invalidateQueries({ queryKey: qk.faturas.historico(id) });
  }
};

export function useAtualizarFatura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; payload: Record<string, unknown>; motivo: string; anexo_path?: string | null; anexo_nome?: string | null }) => {
      const { error } = await supabase.rpc("atualizar_faturamento", {
        _fatura_id: args.id,
        _numero_nf: (args.payload.numero_nf as string) || null,
        _serie_nf: (args.payload.serie_nf as string) || null,
        _data_emissao: (args.payload.data_emissao as string) || null,
        _valor_bruto: args.payload.valor_bruto === "" ? null : Number(args.payload.valor_bruto),
        _valor_liquido: args.payload.valor_liquido === "" ? null : Number(args.payload.valor_liquido),
        _data_vencimento: (args.payload.data_vencimento as string) || null,
        _data_prevista_recebimento: (args.payload.data_prevista_recebimento as string) || null,
        _observacoes_fiscais: (args.payload.observacoes_fiscais as string) || null,
        _observacoes_financeiras: (args.payload.observacoes_financeiras as string) || null,
        _anexo_nf_storage_path: args.anexo_path ?? null,
        _anexo_nf_nome: args.anexo_nome ?? null,
        _motivo: args.motivo,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { invalFatura(qc, v.id); notify.success("Faturamento atualizado"); },
    onError: (e: Error) => notify.error(e.message),
  });
}

export function useRegistrarPagamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; data_pagamento: string; valor_recebido: number; motivo_diferenca?: string | null; motivo?: string }) => {
      const { error } = await supabase.rpc("registrar_pagamento_faturamento", {
        _fatura_id: args.id,
        _data_pagamento: args.data_pagamento,
        _valor_recebido: args.valor_recebido,
        _motivo_diferenca: args.motivo_diferenca ?? null,
        _motivo: args.motivo || "Registro de pagamento",
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { invalFatura(qc, v.id); notify.success("Pagamento registrado"); },
    onError: (e: Error) => notify.error(e.message),
  });
}

export function useCancelarFatura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("cancelar_faturamento", { _fatura_id: id, _motivo: motivo });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { invalFatura(qc, v.id); notify.success("Faturamento cancelado"); },
    onError: (e: Error) => notify.error(e.message),
  });
}
