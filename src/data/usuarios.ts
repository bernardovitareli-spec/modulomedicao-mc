import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/queryKeys";
import { notify } from "@/lib/notify";
import type { AppRole } from "@/lib/permissions";

export function useUsuariosAtivos() {
  return useQuery({
    queryKey: qk.usuarios.ativos,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data as unknown as Array<Record<string, unknown>>) ?? [];
    },
  });
}

export function useUsuariosPendentes() {
  return useQuery({
    queryKey: qk.usuarios.pendentes,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_pendentes");
      if (error) throw error;
      return (data as unknown as Array<{ user_id: string; email: string; solicitado_em: string }>) ?? [];
    },
  });
}

export function useUsuarioVinculos(userId?: string) {
  return useQuery({
    queryKey: qk.usuarios.vinculos(userId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_user_clientes", { _user_id: userId! });
      if (error) throw error;
      return ((data as unknown as Array<{ cliente_id: string }>) ?? []).map((r) => r.cliente_id);
    },
    enabled: !!userId,
  });
}

const invalUsers = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: qk.usuarios.ativos });
  qc.invalidateQueries({ queryKey: qk.usuarios.pendentes });
};

export function useAprovarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { user_id: string; role: AppRole; cliente_ids?: string[] | null }) => {
      const { error } = await supabase.rpc("admin_aprovar_usuario", {
        _user_id: args.user_id,
        _role: args.role,
        _cliente_ids: args.role === "visualizacao" ? args.cliente_ids ?? [] : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalUsers(qc); notify.success("Usuário aprovado"); },
    onError: (e: Error) => notify.error(e.message),
  });
}

export function useRejeitarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, motivo }: { user_id: string; motivo: string }) => {
      const { error } = await supabase.rpc("admin_rejeitar_usuario", { _user_id: user_id, _motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { invalUsers(qc); notify.success("Cadastro rejeitado"); },
    onError: (e: Error) => notify.error(e.message),
  });
}

export function useDefinirRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) => {
      const { error } = await supabase.rpc("admin_set_user_role", { _target_user: user_id, _role: role });
      if (error) throw error;
    },
    onSuccess: () => { invalUsers(qc); notify.success("Perfil atualizado"); },
    onError: (e: Error) => notify.error(e.message),
  });
}

export function useEditarVinculosCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, cliente_ids }: { user_id: string; cliente_ids: string[] }) => {
      const { error } = await supabase.rpc("admin_set_user_clientes", { _user_id: user_id, _cliente_ids: cliente_ids });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalUsers(qc);
      qc.invalidateQueries({ queryKey: qk.usuarios.vinculos(v.user_id) });
      notify.success("Vínculos atualizados");
    },
    onError: (e: Error) => notify.error(e.message),
  });
}
