import { z } from "zod";
import { validarCNPJ, normalizarCNPJ } from "@/lib/br/cnpj";
import { validarCEP } from "@/lib/br/cep";
import { validarTelefone } from "@/lib/br/telefone";
import { UFS } from "./cliente";

export const empresaEmissoraSchema = z.object({
  razao_social: z.string().trim().min(3).max(200),
  nome_fantasia: z.string().trim().max(200).optional().or(z.literal("")),
  cnpj: z.string().transform(normalizarCNPJ).refine(validarCNPJ, { message: "CNPJ inválido." }),
  inscricao_estadual: z.string().trim().max(30).optional().or(z.literal("")),
  inscricao_municipal: z.string().trim().max(30).optional().or(z.literal("")),
  endereco: z.string().trim().max(300).optional().or(z.literal("")),
  bairro: z.string().trim().max(120).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.enum(UFS).optional().or(z.literal("")),
  cep: z.string().optional().or(z.literal(""))
    .refine((v) => !v || validarCEP(v), { message: "CEP inválido." }),
  telefone: z.string().optional().or(z.literal(""))
    .refine((v) => !v || validarTelefone(v), { message: "Telefone inválido." }),
  email: z.string().trim().email({ message: "E-mail inválido." }).optional().or(z.literal("")),
  site: z.string().trim().max(200).optional().or(z.literal("")),
  observacoes_padrao: z.string().max(2000).optional().or(z.literal("")),
  banco_nome: z.string().max(120).optional().or(z.literal("")),
  banco_agencia: z.string().max(20).optional().or(z.literal("")),
  banco_conta: z.string().max(30).optional().or(z.literal("")),
  chave_pix: z.string().max(120).optional().or(z.literal("")),
});

export type EmpresaEmissoraFormData = z.infer<typeof empresaEmissoraSchema>;
