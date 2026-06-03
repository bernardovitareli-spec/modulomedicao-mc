import { z } from "zod";
import { normalizarCNPJ, validarCNPJ } from "@/lib/br/cnpj";

// Schema unificado para uma linha do XLSX (M1, M3 ou M4).
// Discriminated union por origem. Reaproveita regras (CNPJ, valores, horas).

const numNN = z.coerce.number({ message: "Valor numérico inválido." }).nonnegative({ message: "Valor não pode ser negativo." });

const baseLinha = z.object({
  linha: z.number().int(),
  cnpj_cliente: z.string().optional().nullable().refine(
    (v) => !v || validarCNPJ(normalizarCNPJ(v)),
    { message: "CNPJ do cliente inválido." },
  ),
  numero_dj: z.string().trim().min(1, { message: "Número DJ obrigatório." }),
  equipamento_tag: z.string().trim().min(1, { message: "Tag do equipamento obrigatória." }),
  data: z.string().min(1, { message: "Data obrigatória." }),
});

export const linhaM1Schema = baseLinha.extend({
  origem: z.literal("M1"),
  horimetro_inicial: numNN,
  horimetro_final: numNN,
  horas_informadas: numNN,
  valor_hora: z.coerce.number().positive({ message: "Valor/hora deve ser maior que zero." }).optional().nullable(),
}).superRefine((d, ctx) => {
  if (d.horimetro_final < d.horimetro_inicial) {
    ctx.addIssue({ code: "custom", path: ["horimetro_final"], message: "Horímetro final deve ser >= inicial." });
  }
});

export const linhaM3Schema = baseLinha.extend({
  origem: z.literal("M3"),
  horas_paradas: numNN.optional().default(0),
  horas_mecanicas: numNN.optional().default(0),
  motivo: z.string().optional().or(z.literal("")),
});

export const linhaM4Schema = baseLinha.extend({
  origem: z.literal("M4"),
  horas_chuvoso: numNN.optional().default(0),
  excecao: z.coerce.boolean().optional().default(false),
});

export const importacaoLinhaSchema = z.discriminatedUnion("origem", [
  linhaM1Schema, linhaM3Schema, linhaM4Schema,
]);

export type ImportacaoLinha = z.infer<typeof importacaoLinhaSchema>;

export interface ErroLinha {
  linha: number;
  campo: string;
  mensagem: string;
}

export function validarLinhaImportacao(input: unknown): { ok: true; data: ImportacaoLinha } | { ok: false; erros: ErroLinha[] } {
  const r = importacaoLinhaSchema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const linhaIdx = (input as { linha?: number })?.linha ?? 0;
  const erros: ErroLinha[] = r.error.issues.map((i) => ({
    linha: linhaIdx,
    campo: (i.path ?? []).join(".") || "(geral)",
    mensagem: i.message,
  }));
  return { ok: false, erros };
}
