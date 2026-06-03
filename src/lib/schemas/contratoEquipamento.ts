import { z } from "zod";

export const contratoEquipamentoSchema = z.object({
  contrato_id: z.string().uuid(),
  equipamento_id: z.string().uuid({ message: "Selecione um equipamento." }),
  data_inicio: z.string().min(1, { message: "Data de início obrigatória." }),
  data_fim: z.string().nullable().optional().or(z.literal("")),
  horimetro_inicial: z.coerce.number().nonnegative({ message: "Horímetro inicial não pode ser negativo." }).default(0),
  valor_hora_override: z.coerce.number().nonnegative().nullable().optional(),
  observacoes: z.string().trim().max(500).optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.data_fim && data.data_fim < data.data_inicio) {
    ctx.addIssue({
      code: "custom",
      path: ["data_fim"],
      message: "Data de fim deve ser maior ou igual à data de início.",
    });
  }
});

export type ContratoEquipamentoFormData = z.infer<typeof contratoEquipamentoSchema>;
