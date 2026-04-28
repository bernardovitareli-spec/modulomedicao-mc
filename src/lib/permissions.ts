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

  const canDeleteMedicao = (status: string) => {
    if (isAdmin) return ["rascunho", "importada", "rejeitada"].includes(status);
    if (isGestor) return status === "rascunho";
    return false;
  };
  const canCancelMedicao = (status: string) =>
    (isAdmin || isGestor) && !["faturada", "cancelada"].includes(status);
  const canEditMedicao = (status: string) =>
    hasAnyRole(["admin", "gestor_contrato", "operacional"]) &&
    ["rascunho", "importada"].includes(status);
  const canPurgeImportacao = isAdmin;
  const canViewAudit = isAdmin;
  const canManageUsers = isAdmin;

  return {
    roles,
    isAdmin,
    isGestor,
    isOperacional,
    canDeleteMedicao,
    canCancelMedicao,
    canEditMedicao,
    canPurgeImportacao,
    canViewAudit,
    canManageUsers,
  };
}
