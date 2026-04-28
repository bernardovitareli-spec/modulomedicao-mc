// Configuração centralizada dos tipos de regra contratual.
export type RegraCampo =
  | { key: string; label: string; type: "number"; step?: string; placeholder?: string }
  | { key: string; label: string; type: "text"; placeholder?: string }
  | { key: string; label: string; type: "textarea"; placeholder?: string }
  | { key: string; label: string; type: "switch"; default?: boolean }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; default?: string };

export interface RegraTipoConfig {
  value: string;
  label: string;
  descricao: string;
  campos: RegraCampo[];
}

export const TIPOS_REGRA: RegraTipoConfig[] = [
  {
    value: "valor_hora",
    label: "Valor por hora",
    descricao: "Define o valor pago por hora trabalhada.",
    campos: [{ key: "valor", label: "Valor R$/hora", type: "number", step: "0.01" }],
  },
  {
    value: "garantia_minima",
    label: "Garantia mínima",
    descricao: "Quantidade mínima de horas garantidas no período.",
    campos: [{ key: "horas", label: "Horas garantidas", type: "number", step: "0.01" }],
  },
  {
    value: "desconto_horas_mecanicas",
    label: "Desconto de horas mecânicas",
    descricao: "Define se horas mecânicas serão descontadas das horas informadas.",
    campos: [{ key: "aplicar", label: "Descontar horas mecânicas", type: "switch", default: true }],
  },
  {
    value: "periodo_chuvoso",
    label: "Período chuvoso",
    descricao: "Como tratar a garantia em período chuvoso.",
    campos: [{
      key: "modo", label: "Modo", type: "select", default: "normal",
      options: [
        { value: "normal", label: "Aplicar garantia normalmente" },
        { value: "sem_garantia", label: "Não aplicar garantia" },
        { value: "somente_informadas", label: "Aplicar somente horas informadas" },
        { value: "personalizada", label: "Aplicar regra personalizada" },
      ],
    }],
  },
  {
    value: "excecao_chuvoso",
    label: "Exceção chuvoso",
    descricao: "Se a exceção chuvoso = Sim, aplica garantia normalmente; caso contrário, segue regra de período chuvoso.",
    campos: [],
  },
  {
    value: "desconto_manual",
    label: "Desconto manual",
    descricao: "Desconto aplicado manualmente em valor fixo ou percentual.",
    campos: [
      { key: "valor_fixo", label: "Valor fixo R$", type: "number", step: "0.01" },
      { key: "percentual", label: "% sobre valor bruto", type: "number", step: "0.01" },
      { key: "observacoes", label: "Observações", type: "textarea" },
    ],
  },
  {
    value: "complementar",
    label: "Complementar",
    descricao: "Valor complementar adicionado ao item.",
    campos: [
      { key: "valor_fixo", label: "Valor fixo R$", type: "number", step: "0.01" },
      { key: "percentual", label: "% sobre valor bruto", type: "number", step: "0.01" },
      { key: "justificativa", label: "Justificativa", type: "textarea" },
    ],
  },
  {
    value: "regra_personalizada",
    label: "Regra personalizada",
    descricao: "Regra customizada para conferência manual.",
    campos: [
      { key: "nome", label: "Nome da regra", type: "text" },
      { key: "descricao", label: "Descrição", type: "textarea" },
      { key: "observacao", label: "Observação para conferência", type: "textarea" },
    ],
  },
];

export const labelTipo = (v: string) => TIPOS_REGRA.find((t) => t.value === v)?.label ?? v;
