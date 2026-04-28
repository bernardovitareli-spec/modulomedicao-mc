// Motor de cálculo de medições - aplica regras vigentes por período.

export type RegraTipo =
  | "valor_hora" | "garantia_minima" | "desconto_horas_mecanicas" | "desconto_horas_paradas"
  | "periodo_chuvoso" | "excecao_chuvoso" | "complementar" | "desconto" | "glosa" | "aditivo_contratual";

export interface Regra {
  id: string;
  tipo: RegraTipo;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  parametros: Record<string, unknown>;
}

export interface ItemEntrada {
  horas_informadas: number;
  horas_mecanicas: number;
  horas_paradas: number;
  horas_chuvoso: number;
  horas_excecao_chuvoso: number;
  valor_hora_override?: number | null;
  complementares_extra?: number;
  observacoes?: string;
}

export interface ItemCalculado {
  horas_informadas: number;
  horas_mecanicas: number;
  horas_paradas: number;
  horas_chuvoso: number;
  horas_excecao_chuvoso: number;
  horas_descontaveis: number;
  horas_liquidas: number;
  garantia_minima: number;
  horas_a_pagar: number;
  valor_hora: number;
  valor_bruto: number;
  valor_complementares: number;
  valor_descontos: number;
  valor_glosas: number;
  valor_aditivos: number;
  valor_final: number;
  regras_aplicadas: { id: string; tipo: RegraTipo; descricao: string }[];
  memoria_calculo: { passo: string; valor: number; detalhe?: string }[];
}

const isVigente = (r: Regra, d: string) =>
  r.vigencia_inicio <= d && (!r.vigencia_fim || r.vigencia_fim >= d);

const getRegra = (regras: Regra[], tipo: RegraTipo, data: string) =>
  regras.filter((r) => r.tipo === tipo && isVigente(r, data)).sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0];

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : Number(v ?? d) || d);

export function calcularItem(
  entrada: ItemEntrada,
  regras: Regra[],
  dataReferencia: string,
  fallbackValorHora = 0,
  fallbackGarantia = 0,
): ItemCalculado {
  const aplicadas: ItemCalculado["regras_aplicadas"] = [];
  const memoria: ItemCalculado["memoria_calculo"] = [];

  // 1. Valor/hora
  const rValor = getRegra(regras, "valor_hora", dataReferencia);
  const valorHora = entrada.valor_hora_override ?? num(rValor?.parametros?.valor, fallbackValorHora);
  if (rValor) aplicadas.push({ id: rValor.id, tipo: "valor_hora", descricao: `R$ ${valorHora.toFixed(2)}/h` });

  // 2. Horas descontáveis (mecânicas + paradas + chuvoso - exceção)
  const rMec = getRegra(regras, "desconto_horas_mecanicas", dataReferencia);
  const aplicaMec = !rMec || rMec.parametros?.aplicar !== false;
  const horasMecDesc = aplicaMec ? entrada.horas_mecanicas : 0;
  if (rMec && aplicaMec) aplicadas.push({ id: rMec.id, tipo: "desconto_horas_mecanicas", descricao: "Descontar horas mecânicas" });

  const rPar = getRegra(regras, "desconto_horas_paradas", dataReferencia);
  const aplicaPar = !rPar || rPar.parametros?.aplicar !== false;
  const horasParDesc = aplicaPar ? entrada.horas_paradas : 0;
  if (rPar && aplicaPar) aplicadas.push({ id: rPar.id, tipo: "desconto_horas_paradas", descricao: "Descontar horas paradas" });

  const rChuva = getRegra(regras, "periodo_chuvoso", dataReferencia);
  const aplicaChuva = !rChuva || rChuva.parametros?.aplicar !== false;
  let horasChuvaDesc = aplicaChuva ? entrada.horas_chuvoso : 0;
  if (rChuva && aplicaChuva) aplicadas.push({ id: rChuva.id, tipo: "periodo_chuvoso", descricao: "Descontar horas em período chuvoso" });

  const rExc = getRegra(regras, "excecao_chuvoso", dataReferencia);
  const horasExcecao = entrada.horas_excecao_chuvoso;
  if (rExc) aplicadas.push({ id: rExc.id, tipo: "excecao_chuvoso", descricao: "Aplicar exceção de chuvoso" });
  horasChuvaDesc = Math.max(0, horasChuvaDesc - horasExcecao);

  const horasDescontaveis = horasMecDesc + horasParDesc + horasChuvaDesc;
  const horasLiquidas = Math.max(0, entrada.horas_informadas - horasDescontaveis);

  memoria.push({ passo: "Horas informadas", valor: entrada.horas_informadas });
  memoria.push({ passo: "(-) Horas mecânicas", valor: horasMecDesc });
  memoria.push({ passo: "(-) Horas paradas", valor: horasParDesc });
  memoria.push({ passo: "(-) Período chuvoso", valor: horasChuvaDesc, detalhe: horasExcecao ? `exceção: ${horasExcecao}h` : undefined });
  memoria.push({ passo: "= Horas líquidas", valor: horasLiquidas });

  // 3. Garantia mínima
  const rGar = getRegra(regras, "garantia_minima", dataReferencia);
  const garantiaAtiva = rGar?.parametros?.ativa !== false;
  const garantia = garantiaAtiva ? num(rGar?.parametros?.horas, fallbackGarantia) : 0;
  if (rGar && garantiaAtiva) aplicadas.push({ id: rGar.id, tipo: "garantia_minima", descricao: `Mínimo ${garantia}h` });

  const horasAPagar = Math.max(horasLiquidas, garantia);
  memoria.push({ passo: "Garantia mínima", valor: garantia });
  memoria.push({ passo: "→ Horas a pagar", valor: horasAPagar });

  // 4. Valores
  const valorBruto = horasAPagar * valorHora;
  memoria.push({ passo: "Valor bruto", valor: valorBruto, detalhe: `${horasAPagar}h × R$ ${valorHora.toFixed(2)}` });

  // Complementares
  let valorComp = num(entrada.complementares_extra);
  const rComp = getRegra(regras, "complementar", dataReferencia);
  if (rComp) {
    const fixo = num(rComp.parametros?.valor_fixo);
    const perc = num(rComp.parametros?.percentual);
    valorComp += fixo + (valorBruto * perc) / 100;
    aplicadas.push({ id: rComp.id, tipo: "complementar", descricao: `Complementar: +R$ ${fixo} ${perc ? `+ ${perc}%` : ""}` });
  }

  // Descontos
  let valorDesc = 0;
  const rDesc = getRegra(regras, "desconto", dataReferencia);
  if (rDesc) {
    const fixo = num(rDesc.parametros?.valor_fixo);
    const perc = num(rDesc.parametros?.percentual);
    valorDesc += fixo + (valorBruto * perc) / 100;
    aplicadas.push({ id: rDesc.id, tipo: "desconto", descricao: `Desconto: -R$ ${fixo} ${perc ? `- ${perc}%` : ""}` });
  }

  // Glosas
  let valorGlosa = 0;
  const rGlosa = getRegra(regras, "glosa", dataReferencia);
  if (rGlosa) {
    valorGlosa = num(rGlosa.parametros?.valor);
    aplicadas.push({ id: rGlosa.id, tipo: "glosa", descricao: `Glosa: -R$ ${valorGlosa}` });
  }

  // Aditivos
  let valorAditivo = 0;
  const rAdit = getRegra(regras, "aditivo_contratual", dataReferencia);
  if (rAdit) {
    valorAditivo = num(rAdit.parametros?.valor);
    aplicadas.push({ id: rAdit.id, tipo: "aditivo_contratual", descricao: `Aditivo: +R$ ${valorAditivo}` });
  }

  const valorFinal = valorBruto + valorComp - valorDesc - valorGlosa + valorAditivo;
  memoria.push({ passo: "+ Complementares", valor: valorComp });
  memoria.push({ passo: "- Descontos", valor: valorDesc });
  memoria.push({ passo: "- Glosas", valor: valorGlosa });
  memoria.push({ passo: "+ Aditivos", valor: valorAditivo });
  memoria.push({ passo: "= Valor final", valor: valorFinal });

  return {
    horas_informadas: entrada.horas_informadas,
    horas_mecanicas: entrada.horas_mecanicas,
    horas_paradas: entrada.horas_paradas,
    horas_chuvoso: entrada.horas_chuvoso,
    horas_excecao_chuvoso: entrada.horas_excecao_chuvoso,
    horas_descontaveis: horasDescontaveis,
    horas_liquidas: horasLiquidas,
    garantia_minima: garantia,
    horas_a_pagar: horasAPagar,
    valor_hora: valorHora,
    valor_bruto: valorBruto,
    valor_complementares: valorComp,
    valor_descontos: valorDesc,
    valor_glosas: valorGlosa,
    valor_aditivos: valorAditivo,
    valor_final: valorFinal,
    regras_aplicadas: aplicadas,
    memoria_calculo: memoria,
  };
}
