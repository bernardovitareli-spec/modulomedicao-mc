import { z } from "zod";
import { validarCNPJ, normalizarCNPJ } from "@/lib/br/cnpj";
import { validarCEP } from "@/lib/br/cep";
import { validarTelefone } from "@/lib/br/telefone";

export const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

export const clienteSchema = z.object({
  razao_social: z.string().trim().min(3, { message: "Razão social deve ter ao menos 3 caracteres." }).max(200),
  nome_fantasia: z.string().trim().max(200).optional().or(z.literal("")),
  cnpj: z.string().transform(normalizarCNPJ).refine(validarCNPJ, { message: "CNPJ inválido." }),
  inscricao_estadual: z.string().trim().max(30).optional().or(z.literal("")),
  endereco: z.string().trim().max(300).optional().or(z.literal("")),
  bairro: z.string().trim().max(120).optional().or(z.literal("")),
  endereco_complemento: z.string().trim().max(120).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.enum(UFS).optional().or(z.literal("")),
  cep: z.string().optional().or(z.literal(""))
    .refine((v) => !v || validarCEP(v), { message: "CEP inválido." }),
  contato_nome: z.string().trim().max(120).optional().or(z.literal("")),
  contato_email: z.string().trim().email({ message: "E-mail inválido." }).max(200).optional().or(z.literal("")),
  contato_telefone: z.string().optional().or(z.literal(""))
    .refine((v) => !v || validarTelefone(v), { message: "Telefone inválido." }),
  observacoes: z.string().trim().max(1000).optional().or(z.literal("")),
  status: z.enum(["ativo", "inativo"]).default("ativo"),
});

export type ClienteFormData = z.infer<typeof clienteSchema>;
export const clientePartialSchema = clienteSchema.partial();
