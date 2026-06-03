import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/queryKeys";

// Agrega as 4 queries paralelas que o Dashboard precisa.
// Mantém compatibilidade total com a versão atual (mesmos campos selecionados).
export function useDashboardSnapshot() {
  const results = useQueries({
    queries: [
      {
        queryKey: qk.dashboard.snapshot("medicoes"),
        queryFn: async () => {
          const { data, error } = await supabase
            .from("medicoes")
            .select("id,contrato_id,competencia,periodo_inicio,periodo_fim,status,valor_final,valor_bruto,valor_descontos,valor_complementares,total_horas_informadas,total_horas_liquidas,total_horas_pagar,ativa,versao,medicao_original_id,aprovada_cliente_em,created_at,updated_at,motivo_reimportacao")
            .limit(5000);
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: qk.dashboard.snapshot("contratos"),
        queryFn: async () => {
          const { data, error } = await supabase
            .from("contratos")
            .select("id,cliente_id,numero_dj,centro_custo,tipo_servico,fornecedor_nome,status,inicio_operacao,termino_contrato")
            .limit(2000);
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: qk.dashboard.snapshot("clientes"),
        queryFn: async () => {
          const { data, error } = await supabase
            .from("clientes")
            .select("id,razao_social,nome_fantasia,cnpj,endereco,cidade,uf")
            .limit(2000);
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: qk.dashboard.snapshot("faturas"),
        queryFn: async () => {
          const { data, error } = await supabase
            .from("faturas")
            .select("id,medicao_id,status,valor,valor_recebido,data_emissao,data_vencimento,data_pagamento,numero_nf")
            .limit(5000);
          if (error) throw error;
          return data ?? [];
        },
      },
    ],
  });

  const [m, c, cl, f] = results;
  const isLoading = results.some((r) => r.isLoading);
  const isFetching = results.some((r) => r.isFetching);
  const error = results.find((r) => r.error)?.error as Error | undefined;

  return {
    medicoes: (m.data ?? []) as any[],
    contratos: (c.data ?? []) as any[],
    clientes: (cl.data ?? []) as any[],
    faturas: (f.data ?? []) as any[],
    isLoading,
    isFetching,
    error,
    refetch: () => {
      results.forEach((r) => r.refetch());
    },
    updatedAt: results
      .map((r) => r.dataUpdatedAt)
      .reduce((a, b) => Math.max(a, b), 0),
  };
}
