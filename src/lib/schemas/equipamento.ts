import { z } from "zod";

const ANO_MIN = 1980;
const ANO_MAX = new Date().getFullYear() + 1;

export const equipamentoSchema = z.object({
  tipo: z.string().trim().min(2, { message: "Informe o tipo." }).max(80),
  modelo: z.string().trim().min(2, { message: "Informe o modelo." }).max(120),
  serie: z.string().trim().max(80).optional().or(z.literal("")),
  tag: z.string().trim().min(2).max(30).regex(/^[A-Z0-9-]+$/i, {
    message: "Tag aceita apenas letras, números e hífen.",
  }),
  ano: z.coerce.number().int().min(ANO_MIN).max(ANO_MAX).nullable().optional(),
  status: z.enum(["ativo", "manutencao", "inativo"]).default("ativo"),
  observacoes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type EquipamentoFormData = z.input<typeof equipamentoSchema>;
