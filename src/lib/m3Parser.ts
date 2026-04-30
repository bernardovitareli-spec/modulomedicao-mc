// Modelo M3 — Controle de Horímetros Obras Ápia
// Layout independente. Não altera M1/M2.

import * as XLSX from "xlsx";

export const M3_LABEL = "M3 — Controle de Horímetros Obras Ápia";

const normalize = (s: any): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const num = (v: any): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/[R$\s]/g, "");
  if (/,\d{1,2}$/.test(s)) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(s.replace(/,/g, "")) || 0;
};

const str = (v: any): string => String(v ?? "").trim();

const parseDate = (v: any): string | null => {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
};

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

const parseMesRef = (v: any): string | null => {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 7) + "-01";
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 7) + "-01";
  }
  const raw = String(v).trim();
  let m = raw.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  m = raw.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
  const d = parseDate(raw);
  if (d) return d.slice(0, 7) + "-01";
  const s = normalize(raw);
  const m2 = s.match(/(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s*(?:de\s*)?(\d{2,4})/);
  if (m2) {
    const mm = MESES[m2[1]];
    let yy = m2[2];
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm}-01`;
  }
  return null;
};

const parseSN = (v: any): boolean => {
  const s = normalize(v);
  return s === "s" || s === "sim" || s === "yes" || s === "true" || s === "1";
};

// Cabeçalhos esperados (forma normalizada → nome lógico)
const M3_HEADER_ALIASES: Record<string, string[]> = {
  mes_ref: ["mes referencia", "mes ref", "mes"],
  numero_dj: ["n dj", "no dj", "numero dj", "dj"],
  contratado: ["contratado"],
  tipo_equip: ["tipo equipamento", "tipo equip"],
  modelo: ["modelo"],
  serie: ["serie"],
  tag: ["tag"],
  centro_custo: ["centro custo", "cc"],
  inicio_op: ["inicio operacao", "inicio op"],
  termino_contrato: ["termino contrato", "fim contrato"],
  hor_inicial: ["hor inicial", "horimetro inicial", "h inicial"],
  hor_final: ["hor final", "horimetro final", "h final"],
  ht_calc: ["diferenca ht calc", "diferenca", "ht calc", "ht calculado"],
  ht_informado: ["ht informado", "ht inf"],
  divergencia_ht: ["divergencia ht", "divergencia"],
  garantia_contratual: ["garantia contratual", "garantia"],
  periodo_chuvoso: ["periodo chuvoso", "periodo chuvoso s n", "chuvoso"],
  excecao_chuvoso: ["excecao chuvoso", "excecao chuvoso s n", "exc chuvoso"],
  garantia_real: ["garantia real"],
  tipo_pagamento: ["tipo pagamento"],
  horas_pagar_bruto: ["horas a pagar bruto", "horas pagar bruto", "h pagar bruto"],
  horas_mec: ["h mecanicas", "horas mecanicas", "mecanicas"],
  horas_pagar_liquido: ["horas a pagar liquido", "horas pagar liquido", "h pagar liquido"],
  valor_hora: ["valor hora", "valor hora r", "vlr hora"],
  medicao_planilha: ["medicao r", "medicao", "valor medicao", "medicao final"],
  observacoes: ["observacoes", "obs"],
};

// Cabeçalhos exigidos para reconhecer M3 (subconjunto distintivo)
const M3_REQUIRED = [
  "mes_ref", "numero_dj", "contratado", "tipo_equip", "modelo", "serie", "tag",
  "hor_inicial", "hor_final", "ht_informado", "garantia_contratual",
  "tipo_pagamento", "horas_pagar_bruto", "horas_mec", "horas_pagar_liquido",
  "valor_hora", "medicao_planilha",
];

interface M3Header {
  rowIndex: number;
  colMap: Record<string, number>;
  missing: string[];
}

function detectM3Header(matrix: any[][], maxRows = 10): M3Header {
  const maxScan = Math.min(matrix.length, maxRows);
  let best: M3Header = { rowIndex: -1, colMap: {}, missing: M3_REQUIRED.slice() };
  for (let i = 0; i < maxScan; i++) {
    const row = matrix[i] ?? [];
    const cells = row.map((c: any) => normalize(c));
    const colMap: Record<string, number> = {};
    for (const [logical, aliases] of Object.entries(M3_HEADER_ALIASES)) {
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        if (!cell) continue;
        const matched = aliases.some((a) => cell === a || cell.startsWith(a + " ") || cell.endsWith(" " + a));
        if (matched && !(logical in colMap)) colMap[logical] = c;
      }
    }
    const missing = M3_REQUIRED.filter((k) => !(k in colMap));
    if (missing.length < best.missing.length) {
      best = { rowIndex: i, colMap, missing };
      if (missing.length === 0) return best;
    }
  }
  return best;
}

export interface M3Linha {
  rowExcel: number;
  mes_ref: string | null;
  numero_dj: string;
  contratado_raw: string;
  fornecedor_nome: string;
  fornecedor_codigo: string;
  tipo_equip: string;
  modelo: string;
  serie: string;
  tag: string;
  centro_custo: string;
  inicio_op: string | null;
  termino_contrato: string | null;
  hor_inicial: number;
  hor_final: number;
  ht_calculado: number;
  ht_informado: number;
  ht_informado_assumido: boolean; // verdadeiro se HT informado veio vazio
  divergencia_ht: number;
  garantia_contratual: number;
  garantia_real: number;
  garantia_aplicada: number;
  periodo_chuvoso: boolean;
  excecao_chuvoso: boolean;
  tipo_pagamento: string; // "H.G." | "H.T." | livre
  horas_pagar_bruto: number;
  horas_mec: number;
  horas_pagar_liquido: number;
  valor_hora: number;
  valor_final: number;          // recalculado
  valor_planilha: number;
  diferenca_calc: number;
  observacoes: string;
  erros: string[];
  alertas: string[];
}

export interface M3LinhaIgnorada {
  rowExcel: number;
  motivo: string;
  preview: string;
}

export interface M3ParseResult {
  ok: boolean;
  motivo?: string; // se !ok
  sheetName: string;
  headerRowIndex: number;
  colMap: Record<string, number>;    // colunas mapeadas (logical → index)
  abaNomeSemSufixo: string;          // "Obra 937 - CKS"
  competenciaSugerida: string | null; // YYYY-MM-01
  centroCustoSugerido: string;
  fornecedorNome: string;            // primeiro fornecedor encontrado
  fornecedorCodigo: string;
  numeroDjUnico: string;             // se houver apenas 1
  linhas: M3Linha[];
  ignoradas: M3LinhaIgnorada[];
}

// "Obra 937 - CKS (Abril)" → { base: "Obra 937 - CKS", mes: "abril" }
function splitNomeAba(name: string): { base: string; mesTexto: string } {
  const m = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { base: m[1].trim(), mesTexto: m[2].trim() };
  return { base: name.trim(), mesTexto: "" };
}

// Abril/2026 a partir do mês textual + ano corrente/contexto
function inferirCompetenciaPelaAba(mesTexto: string, fallbackAno?: number): string | null {
  const s = normalize(mesTexto);
  const mm = MESES[s.split(" ")[0]];
  if (!mm) return null;
  const year = fallbackAno ?? new Date().getFullYear();
  return `${year}-${mm}-01`;
}

// Período sugerido: dia 16 do mês anterior até dia 15 do mês da competência
export function periodoApiaPorCompetencia(competencia: string): { ini: string; fim: string } | null {
  const m = competencia.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const prev = new Date(y, mo - 2, 16); // mês anterior, dia 16
  const fim = new Date(y, mo - 1, 15);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { ini: fmt(prev), fim: fmt(fim) };
}

// Identifica se um workbook tem uma aba M3
export function findM3Sheet(wb: XLSX.WorkBook): string | null {
  for (const name of wb.SheetNames) {
    if (!normalize(name).includes("obra")) continue;
    const sheet = wb.Sheets[name];
    const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
    const hdr = detectM3Header(matrix, 10);
    if (hdr.rowIndex >= 0 && hdr.missing.length === 0) return name;
  }
  return null;
}

export function parseM3(wb: XLSX.WorkBook, sheetName: string): M3ParseResult {
  const sheet = wb.Sheets[sheetName];
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
  const hdr = detectM3Header(matrix, 10);
  const { base, mesTexto } = splitNomeAba(sheetName);

  if (hdr.rowIndex < 0 || hdr.missing.length > 0) {
    return {
      ok: false,
      motivo: `Cabeçalho M3 não localizado. Faltam: ${hdr.missing.join(", ")}`,
      sheetName, headerRowIndex: hdr.rowIndex,
      colMap: hdr.colMap,
      abaNomeSemSufixo: base, competenciaSugerida: null,
      centroCustoSugerido: base, fornecedorNome: "", fornecedorCodigo: "", numeroDjUnico: "",
      linhas: [], ignoradas: [],
    };
  }

  const cm = hdr.colMap;
  const get = (row: any[], k: string) => (k in cm ? row[cm[k]] : "");

  // Linha 4 normalmente contém INPUT/CÁLCULO. Pulamos qualquer linha logo após o cabeçalho
  // que pareça ser legenda (todas as células sendo "input" ou "calculo").
  let startRow = hdr.rowIndex + 1;
  if (startRow < matrix.length) {
    const row = matrix[startRow] ?? [];
    const labels = row.map((c: any) => normalize(c)).filter(Boolean);
    if (labels.length > 0 && labels.every((l) => l === "input" || l === "calculo" || l === "calc")) {
      startRow++;
    }
  }

  const linhas: M3Linha[] = [];
  const ignoradas: M3LinhaIgnorada[] = [];
  let primeiroFornecedorNome = "";
  let primeiroFornecedorCodigo = "";
  let competenciaInferidaDoCampo: string | null = null;
  const djs = new Set<string>();
  const centroCustosDistintos = new Set<string>();

  for (let i = startRow; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const rowExcel = i + 1;
    const hasAny = row.some((c) => str(c) !== "");
    if (!hasAny) continue;

    const firstNonEmpty = row.find((c) => str(c) !== "");
    const firstNorm = normalize(firstNonEmpty);

    // Parar ao encontrar TOTAL
    if (firstNorm.startsWith("total") || firstNorm === "subtotal") {
      ignoradas.push({ rowExcel, motivo: "Linha TOTAL — leitura interrompida", preview: str(firstNonEmpty) });
      break;
    }

    const numero_dj = str(get(row, "numero_dj"));
    const contratadoRaw = str(get(row, "contratado"));
    const serie = str(get(row, "serie"));
    const tag = str(get(row, "tag"));
    const valor_hora = num(get(row, "valor_hora"));
    const hor_inicial = num(get(row, "hor_inicial"));
    const hor_final = num(get(row, "hor_final"));

    // Ignora linhas claramente não-dado (legenda/instrução, sem séries/tags/horímetros e sem DJ)
    const semCamposChave = !serie && !tag && hor_inicial === 0 && hor_final === 0 && !valor_hora;
    if (semCamposChave) {
      ignoradas.push({ rowExcel, motivo: "Linha sem dados de equipamento", preview: str(firstNonEmpty).slice(0, 80) });
      continue;
    }

    // Fornecedor: "NOME | CODIGO"
    let fornecedor_nome = contratadoRaw;
    let fornecedor_codigo = "";
    const mPipe = contratadoRaw.match(/^(.*?)[\s]*\|[\s]*([^|]+?)\s*$/);
    if (mPipe) {
      fornecedor_nome = mPipe[1].trim();
      fornecedor_codigo = mPipe[2].trim();
    }
    if (!primeiroFornecedorNome && fornecedor_nome) primeiroFornecedorNome = fornecedor_nome;
    if (!primeiroFornecedorCodigo && fornecedor_codigo) primeiroFornecedorCodigo = fornecedor_codigo;
    if (numero_dj) djs.add(numero_dj);

    const mes_ref = parseMesRef(get(row, "mes_ref"));
    if (mes_ref && !competenciaInferidaDoCampo) competenciaInferidaDoCampo = mes_ref;

    const centro_custo = str(get(row, "centro_custo"));
    if (centro_custo) centroCustosDistintos.add(centro_custo);

    const inicio_op = parseDate(get(row, "inicio_op"));
    const termino_contrato = parseDate(get(row, "termino_contrato"));

    const ht_calc_planilha = num(get(row, "ht_calc"));
    const ht_calculado = hor_final - hor_inicial || ht_calc_planilha;

    const ht_informado_raw = get(row, "ht_informado");
    const ht_informado_vazio = ht_informado_raw === "" || ht_informado_raw === null || ht_informado_raw === undefined;
    const ht_informado = ht_informado_vazio ? ht_calculado : num(ht_informado_raw);
    const divergencia_ht = ht_informado - ht_calculado;

    const garantia_contratual = num(get(row, "garantia_contratual"));
    const garantia_real_raw = get(row, "garantia_real");
    const garantia_real_vazio = garantia_real_raw === "" || garantia_real_raw === null || garantia_real_raw === undefined;
    const garantia_real = garantia_real_vazio ? 0 : num(garantia_real_raw);
    const garantia_aplicada = garantia_real_vazio ? garantia_contratual : garantia_real;

    const periodo_chuvoso = parseSN(get(row, "periodo_chuvoso"));
    const excecao_chuvoso = parseSN(get(row, "excecao_chuvoso"));

    const tipo_pagamento_raw = str(get(row, "tipo_pagamento"));
    const tp_norm = normalize(tipo_pagamento_raw).replace(/\s+/g, "");
    let horas_pagar_bruto: number;
    if (tp_norm === "hg" || tp_norm.startsWith("hg")) {
      horas_pagar_bruto = garantia_aplicada;
    } else if (tp_norm === "ht" || tp_norm.startsWith("ht")) {
      horas_pagar_bruto = ht_informado;
    } else {
      // Sem tipo claro — usa o valor da planilha, se houver, senão HT informado
      horas_pagar_bruto = num(get(row, "horas_pagar_bruto")) || ht_informado;
    }

    const horas_mec = num(get(row, "horas_mec"));
    const horas_pagar_liquido = Math.max(0, horas_pagar_bruto - horas_mec);
    const valor_final_calc = horas_pagar_liquido * valor_hora;
    const valor_planilha = num(get(row, "medicao_planilha"));
    const diferenca_calc = valor_planilha ? (valor_planilha - valor_final_calc) : 0;

    const erros: string[] = [];
    const alertas: string[] = [];
    if (!numero_dj) erros.push("Nº DJ ausente");
    if (!serie) erros.push("Série ausente");
    if (!tag) erros.push("Tag ausente");
    if (!hor_inicial && !hor_final) erros.push("Horímetros ausentes");
    if (hor_final < hor_inicial) erros.push("Horímetro final < inicial");
    if (!valor_hora) erros.push("Valor/Hora ausente");
    if (ht_informado_vazio) alertas.push("HT informado vazio — assumido = HT calculado");
    if (Math.abs(divergencia_ht) > 0.01) alertas.push(`Divergência HT: ${divergencia_ht.toFixed(2)}h`);
    if (valor_planilha && Math.abs(diferenca_calc) > 0.10) {
      alertas.push("Divergência entre valor da planilha e valor recalculado.");
    }

    linhas.push({
      rowExcel,
      mes_ref,
      numero_dj,
      contratado_raw: contratadoRaw,
      fornecedor_nome,
      fornecedor_codigo,
      tipo_equip: str(get(row, "tipo_equip")).toUpperCase(),
      modelo: str(get(row, "modelo")),
      serie, tag,
      centro_custo,
      inicio_op, termino_contrato,
      hor_inicial, hor_final,
      ht_calculado, ht_informado, ht_informado_assumido: ht_informado_vazio,
      divergencia_ht,
      garantia_contratual, garantia_real, garantia_aplicada,
      periodo_chuvoso, excecao_chuvoso,
      tipo_pagamento: tipo_pagamento_raw,
      horas_pagar_bruto, horas_mec, horas_pagar_liquido,
      valor_hora,
      valor_final: valor_final_calc,
      valor_planilha,
      diferenca_calc,
      observacoes: str(get(row, "observacoes")),
      erros, alertas,
    });
  }

  // Competência: prioridade ao campo "Mês Referência"; fallback nome da aba
  let competenciaSugerida = competenciaInferidaDoCampo;
  if (!competenciaSugerida && mesTexto) {
    competenciaSugerida = inferirCompetenciaPelaAba(mesTexto);
  }

  // Centro de custo sugerido: o primeiro distinto da coluna, ou nome da aba sem sufixo
  const centroCustoSugerido = centroCustosDistintos.size > 0
    ? Array.from(centroCustosDistintos)[0]
    : base;

  return {
    ok: true,
    sheetName,
    headerRowIndex: hdr.rowIndex,
    colMap: hdr.colMap,
    abaNomeSemSufixo: base,
    competenciaSugerida,
    centroCustoSugerido,
    fornecedorNome: primeiroFornecedorNome,
    fornecedorCodigo: primeiroFornecedorCodigo,
    numeroDjUnico: djs.size === 1 ? Array.from(djs)[0] : "",
    linhas,
    ignoradas,
  };
}
