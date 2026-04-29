import { useAuth } from "@/hooks/useAuth";

export type AppRole = "admin" | "gestor_contrato" | "operacional" | "faturamento" | "visualizacao";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  gestor_contrato: "Gestor",
  operacional: "Operacional",
  faturamento: "Financeiro",
  visualizacao: "Cliente / Aprovador",
};

export function usePermissions() {
  const { roles, hasRole, hasAnyRole } = useAuth();
  const isAdmin = hasRole("admin");
  const isGestor = hasRole("gestor_contrato");
  const isOperacional = hasRole("operacional");
  const isFinanceiro = hasRole("faturamento");
  const isCliente = hasRole("visualizacao");

  // ===== Edição direta de itens =====
  const canEditMedicao = (status: string) => {
    if (isAdmin) return !["paga", "cancelada"].includes(status); // admin com justificativa
    if (hasAnyRole(["gestor_contrato", "operacional"])) return status === "rascunho";
    return false;
  };

  // ===== Recálculo / aplicar regras =====
  const canRecalcular = (status: string) =>
    (isAdmin || isGestor || isOperacional) && (status === "rascunho" || isAdmin);

  // ===== Transições =====
  const canEnviarRevisao = (status: string) =>
    hasAnyRole(["admin", "gestor_contrato", "operacional"]) && status === "rascunho";

  const canAprovarInternamente = (status: string) =>
    hasAnyRole(["admin", "gestor_contrato"]) && status === "em_revisao_interna";

  const canDevolverParaRascunho = (status: string) =>
    hasAnyRole(["admin", "gestor_contrato"]) &&
    ["em_revisao_interna", "aprovada_internamente", "reprovada_cliente"].includes(status);

  const canEnviarAoCliente = (status: string) =>
    hasAnyRole(["admin", "gestor_contrato"]) && status === "aprovada_internamente";

  const canDevolverParaRevisao = (status: string) =>
    hasAnyRole(["admin", "gestor_contrato"]) && status === "aprovada_internamente";

  const canAprovarPeloCliente = (status: string) =>
    hasAnyRole(["admin", "gestor_contrato", "visualizacao"]) && status === "enviada_cliente";

  const canReprovarPeloCliente = canAprovarPeloCliente;

  const canFaturar = (status: string) =>
    hasAnyRole(["admin", "faturamento"]) && status === "aprovada_cliente";

  const canMarcarPaga = (status: string) =>
    hasAnyRole(["admin", "faturamento"]) && status === "faturada";

  const canCancelMedicao = (status: string) =>
    hasAnyRole(["admin", "gestor_contrato"]) && !["faturada", "paga", "cancelada"].includes(status);

  const canDeleteMedicao = (status: string) => {
    if (isAdmin) return ["rascunho"].includes(status);
    if (isGestor) return status === "rascunho";
    return false;
  };

  const canPurgeImportacao = isAdmin;
  const canViewAudit = isAdmin;
  const canManageUsers = isAdmin;

  return {
    roles,
    isAdmin, isGestor, isOperacional, isFinanceiro, isCliente,
    canEditMedicao, canRecalcular,
    canEnviarRevisao, canAprovarInternamente, canDevolverParaRascunho,
    canEnviarAoCliente, canDevolverParaRevisao,
    canAprovarPeloCliente, canReprovarPeloCliente,
    canFaturar, canMarcarPaga,
    canCancelMedicao, canDeleteMedicao,
    canPurgeImportacao, canViewAudit, canManageUsers,
  };
}
