import { z } from "zod";

// Parâmetros por tipo de regra (espelha src/lib/regras.ts).
const valorHoraParams = z.object({
  valor: z.coerce.number().positive({ message: "Valor por hora deve ser positivo." }),
});
const garantiaParams = z.object({
  horas: z.coerce.number().nonnegative({ message: "Horas garantidas não podem ser negativas." }),
});
const descontoMecanicasParams = z.object({
  aplicar: z.coerce.boolean().default(true),
});
const periodoChuvosoParams = z.object({
  modo: z.enum(["normal", "sem_garantia", "somente_informadas", "personalizada"]),
});
const excecaoChuvosoParams = z.object({}).passthrough();
const descontoManualParams = z.object({
  valor_fixo: z.coerce.number().nonnegative().nullable().optional(),
  percentual: z.coerce.number().min(0).max(100).nullable().optional(),
  observacoes: z.string().max(1000).optional().or(z.literal("")),
});
const complementarParams = z.object({
  valor_fixo: z.coerce.number().nonnegative().nullable().optional(),
  percentual: z.coerce.number().min(0).max(100).nullable().optional(),
  justificativa: z.string().max(1000).optional().or(z.literal("")),
});
const personalizadaParams = z.object({
  nome: z.string().min(2, { message: "Informe o nome da regra." }),
  descricao: z.string().max(2000).optional().or(z.literal("")),
  observacao: z.string().max(2000).optional().or(z.literal("")),
});

const PARAMS_BY_TIPO: Record<string, z.ZodTypeAny> = {
  valor_hora: valorHoraParams,
  garantia_minima: garantiaParams,
  desconto_horas_mecanicas: descontoMecanicasParams,
  periodo_chuvoso: periodoChuvosoParams,
  excecao_chuvoso: excecaoChuvosoParams,
  desconto_manual: descontoManualParams,
  complementar: complementarParams,
  regra_personalizada: personalizadaParams,
};

export const regraSchema = z.object({
  contrato_id: z.string().uuid(),
  tipo: z.string().min(1, { message: "Selecione o tipo da regra." }),
  vigencia_inicio: z.string().min(1, { message: "Vigência início obrigatória." }),
  vigencia_fim: z.string().nullable().optional().or(z.literal("")),
  parametros: z.record(z.string(), z.unknown()).default({}),
  ativa: z.coerce.boolean().default(true),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.vigencia_fim && data.vigencia_fim < data.vigencia_inicio) {
    ctx.addIssue({ code: "custom", path: ["vigencia_fim"], message: "Vigência fim deve ser maior ou igual à vigência início." });
  }
  const sub = PARAMS_BY_TIPO[data.tipo];
  if (sub) {
    const r = sub.safeParse(data.parametros ?? {});
    if (!r.success) {
      for (const issue of r.error.issues) {
        ctx.addIssue({ ...issue, path: ["parametros", ...(issue.path ?? [])] });
      }
    }
  }
});

export type RegraFormData = z.input<typeof regraSchema>;
