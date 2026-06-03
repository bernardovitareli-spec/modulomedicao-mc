import { z } from "zod";

export const medicaoItemSchema = z.object({
  equipamento_id: z.string().uuid({ message: "Selecione o equipamento." }),
  horimetro_inicial: z.coerce.number().nonnegative({ message: "Horímetro inicial não pode ser negativo." }),
  horimetro_final: z.coerce.number().nonnegative({ message: "Horímetro final não pode ser negativo." }),
  horas_informadas: z.coerce.number().nonnegative({ message: "Horas informadas não podem ser negativas." }),
  horas_mecanicas: z.coerce.number().nonnegative().default(0),
  horas_paradas: z.coerce.number().nonnegative().default(0),
  horas_chuvoso: z.coerce.number().nonnegative().default(0),
  horas_excecao_chuvoso: z.coerce.number().nonnegative().default(0),
  valor_hora: z.coerce.number().positive({ message: "Valor/hora deve ser maior que zero." }),
  observacoes: z.string().max(1000).optional().or(z.literal("")),
}).superRefine((d, ctx) => {
  if (d.horimetro_final < d.horimetro_inicial) {
    ctx.addIssue({
      code: "custom",
      path: ["horimetro_final"],
      message: "Horímetro final deve ser maior ou igual ao inicial.",
    });
  }
  const descontos = (d.horas_mecanicas ?? 0) + (d.horas_paradas ?? 0) + (d.horas_chuvoso ?? 0) - (d.horas_excecao_chuvoso ?? 0);
  if (descontos > d.horas_informadas) {
    ctx.addIssue({
      code: "custom",
      path: ["horas_paradas"],
      message: "Descontos (mecânicas + paradas + chuvoso − exceção) não podem exceder horas informadas.",
    });
  }
});

export type MedicaoItemFormData = z.input<typeof medicaoItemSchema>;
