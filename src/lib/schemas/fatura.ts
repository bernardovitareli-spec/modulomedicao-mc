import { z } from "zod";

export const faturaSchema = z.object({
  status: z.string().min(1),
  numero_nf: z.string().trim().max(50).optional().or(z.literal("")),
  data_emissao: z.string().optional().or(z.literal("")),
  data_vencimento: z.string().optional().or(z.literal("")),
  valor: z.coerce.number().positive({ message: "Valor deve ser maior que zero." }),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  const exigeNf = ["nf_emitida", "enviada", "paga"].includes(data.status);
  if (exigeNf && !data.numero_nf) {
    ctx.addIssue({ code: "custom", path: ["numero_nf"], message: "Número da NF obrigatório a partir de 'NF emitida'." });
  }
  if (data.data_emissao) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (data.data_emissao > hoje) {
      ctx.addIssue({ code: "custom", path: ["data_emissao"], message: "Data de emissão não pode ser futura." });
    }
  }
  if (data.data_emissao && data.data_vencimento && data.data_vencimento < data.data_emissao) {
    ctx.addIssue({ code: "custom", path: ["data_vencimento"], message: "Vencimento deve ser maior ou igual à emissão." });
  }
});

export type FaturaFormData = z.input<typeof faturaSchema>;
