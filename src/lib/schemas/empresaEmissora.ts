import { z } from "zod";
import { validarCNPJ, normalizarCNPJ } from "@/lib/br/cnpj";
import { validarCEP } from "@/lib/br/cep";
import { validarTelefone } from "@/lib/br/telefone";
import { UFS } from "./cliente";

// Espelha a tabela empresa_emissora real.
export const empresaEmissoraSchema = z.object({
  razao_social: z.string().trim().min(3).max(200),
  nome_fantasia: z.string().trim().max(200).optional().or(z.literal("")),
  cnpj: z.string().transform(normalizarCNPJ).refine(validarCNPJ, { message: "CNPJ inválido." }),
  inscricao_estadual: z.string().trim().max(30).optional().or(z.literal("")),
  inscricao_municipal: z.string().trim().max(30).optional().or(z.literal("")),
  endereco: z.string().trim().max(300).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  complemento: z.string().trim().max(120).optional().or(z.literal("")),
  bairro: z.string().trim().max(120).optional().or(z.literal("")),
  municipio: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.enum(UFS).optional().or(z.literal("")),
  cep: z.string().optional().or(z.literal(""))
    .refine((v) => !v || validarCEP(v), { message: "CEP inválido." }),
  telefone: z.string().optional().or(z.literal(""))
    .refine((v) => !v || validarTelefone(v), { message: "Telefone inválido." }),
  email: z.string().trim().email({ message: "E-mail inválido." }).optional().or(z.literal("")),
  banco: z.string().max(120).optional().or(z.literal("")),
  agencia: z.string().max(20).optional().or(z.literal("")),
  conta_corrente: z.string().max(30).optional().or(z.literal("")),
  chave_pix: z.string().max(120).optional().or(z.literal("")),
  numero_nota_digitos: z.coerce.number().int().min(1).max(11).default(1),
  prazo_recebimento_padrao_dias: z.coerce.number().int().min(0).default(30),
  ativa: z.coerce.boolean().default(true),
  padrao: z.coerce.boolean().default(false),
});

export type EmpresaEmissoraFormData = z.infer<typeof empresaEmissoraSchema>;
