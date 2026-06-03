import { z } from "zod";

const dateStr = z.string().min(1, { message: "Data obrigatória." });
const optionalDateStr = z.string().optional().or(z.literal(""));

export const contratoSchema = z.object({
  cliente_id: z.string().uuid({ message: "Selecione um cliente." }),
  numero_dj: z.string().trim().min(1).max(50),
  tipo_servico: z.string().trim().min(1, { message: "Informe o tipo de serviço." }),
  centro_custo: z.string().trim().max(60).optional().or(z.literal("")),
  inicio_operacao: dateStr,
  termino_contrato: optionalDateStr,
  valor_global: z.coerce.number().nonnegative().nullable().optional(),
  valor_hora_padrao: z.coerce.number().nonnegative().nullable().optional(),
  garantia_minima_horas: z.coerce.number().nonnegative().nullable().optional(),
  observacoes: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(["ativo", "encerrado", "suspenso", "rascunho"]).default("ativo"),
}).superRefine((data, ctx) => {
  if (data.termino_contrato && data.inicio_operacao && data.termino_contrato < data.inicio_operacao) {
    ctx.addIssue({
      code: "custom",
      path: ["termino_contrato"],
      message: "Término deve ser maior ou igual ao início da operação.",
    });
  }
  if (data.status === "ativo" && (data.valor_hora_padrao == null || data.valor_hora_padrao <= 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["valor_hora_padrao"],
      message: "Valor/hora obrigatório para contratos ativos.",
    });
  }
});

export type ContratoFormData = z.input<typeof contratoSchema>;
