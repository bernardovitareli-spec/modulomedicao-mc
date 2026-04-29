export type FaturamentoStatus =
  | "a_faturar"
  | "nf_emitida"
  | "aguardando_pagamento"
  | "pago"
  | "pago_parcial"
  | "em_atraso"
  | "cancelado";

export const FATURAMENTO_STATUS_LABELS: Record<FaturamentoStatus, string> = {
  a_faturar: "A faturar",
  nf_emitida: "NF emitida",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  pago_parcial: "Pago parcialmente",
  em_atraso: "Em atraso",
  cancelado: "Cancelado",
};

export const FATURAMENTO_STATUS_VARIANT: Record<FaturamentoStatus, "default" | "secondary" | "destructive" | "outline"> = {
  a_faturar: "secondary",
  nf_emitida: "outline",
  aguardando_pagamento: "outline",
  pago: "default",
  pago_parcial: "default",
  em_atraso: "destructive",
  cancelado: "secondary",
};

export const labelFatStatus = (s: string) =>
  (FATURAMENTO_STATUS_LABELS as any)[s] ?? s;
