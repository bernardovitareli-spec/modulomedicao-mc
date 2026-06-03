// Tradução cliente-side de mensagens de erro do Postgres para PT-BR amigável.
// Espelha a função SQL public.traduzir_erro_constraint.

const MAPA: Record<string, string> = {
  // medicao_itens
  medicao_itens_horimetro_check: "Horímetro final deve ser maior ou igual ao inicial.",
  medicao_itens_horas_informadas_check: "Horas informadas não podem ser negativas.",
  medicao_itens_valor_hora_check: "Valor por hora deve ser maior que zero.",
  // contratos
  contratos_periodo_check: "Data de término do contrato deve ser maior ou igual à data de início.",
  contratos_valor_global_check: "Valor global do contrato não pode ser negativo.",
  // contrato_equipamentos
  contrato_equipamentos_periodo_check: "Data de fim do vínculo deve ser maior ou igual à data de início.",
  // contrato_regras
  contrato_regras_vigencia_check: "Vigência fim da regra deve ser maior ou igual à vigência início.",
  // faturas
  faturas_valor_check: "Valor da fatura deve ser maior que zero.",
  faturas_datas_check: "Data de vencimento deve ser maior ou igual à data de emissão.",
};

export function traduzirErroSQL(mensagem: string | null | undefined): string {
  const msg = (mensagem ?? "").toString();
  for (const [chave, pt] of Object.entries(MAPA)) {
    if (msg.includes(chave)) return pt;
  }
  // CNPJ inválido (trigger de clientes)
  if (/cnpj.*14.*d[ií]g/i.test(msg) || msg.includes("CNPJ_INVALIDO")) {
    return "CNPJ inválido: precisa ter 14 dígitos.";
  }
  return msg;
}
