import { z } from "zod";

export const alteracaoSchema = z.object({
  contrato_id: z.string().uuid(),
  descricao: z.string().trim().min(5, { message: "Descrição obrigatória (mín. 5 caracteres)." }).max(2000),
  vigencia_inicio: z.string().min(1, { message: "Vigência início obrigatória." }),
  vigencia_fim: z.string().nullable().optional().or(z.literal("")),
  impacto_valor: z.coerce.number().default(0),
  impacto_prazo_dias: z.coerce.number().int().default(0),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.vigencia_fim && data.vigencia_fim < data.vigencia_inicio) {
    ctx.addIssue({ code: "custom", path: ["vigencia_fim"], message: "Vigência fim deve ser maior ou igual à vigência início." });
  }
});

export type AlteracaoFormData = z.infer<typeof alteracaoSchema>;
