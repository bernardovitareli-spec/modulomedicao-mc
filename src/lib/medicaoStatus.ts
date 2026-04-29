// Status do fluxo de aprovação de medição (espelha o enum do banco)
export type MedicaoStatus =
  | "rascunho"
  | "em_revisao_interna"
  | "aprovada_internamente"
  | "enviada_cliente"
  | "aprovada_cliente"
  | "reprovada_cliente"
  | "faturada"
  | "paga"
  | "cancelada";

export const STATUS_LABELS: Record<MedicaoStatus, string> = {
  rascunho: "Rascunho",
  em_revisao_interna: "Em revisão interna",
  aprovada_internamente: "Aprovada internamente",
  enviada_cliente: "Enviada ao cliente",
  aprovada_cliente: "Aprovada pelo cliente",
  reprovada_cliente: "Reprovada pelo cliente",
  faturada: "Faturada",
  paga: "Paga",
  cancelada: "Cancelada",
};

export const STATUS_BADGE_VARIANT: Record<
  MedicaoStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  rascunho: "outline",
  em_revisao_interna: "secondary",
  aprovada_internamente: "default",
  enviada_cliente: "secondary",
  aprovada_cliente: "default",
  reprovada_cliente: "destructive",
  faturada: "default",
  paga: "default",
  cancelada: "destructive",
};

export const labelStatus = (s?: string | null) =>
  (s && (STATUS_LABELS as any)[s]) || s || "—";

export const isStatusFinal = (s: string) =>
  s === "paga" || s === "cancelada";

export const podeEditarItens = (s: string, isAdmin: boolean) =>
  s === "rascunho" || isAdmin;

export const podeRecalcular = (s: string) => s === "rascunho";
