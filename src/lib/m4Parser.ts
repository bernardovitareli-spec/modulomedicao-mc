// Modelo M4 — Obras Ápia / Obra 919 SLB
// Layout independente. Não altera M1/M2/M3.
//
// A planilha possui:
//   - Linha 1: título do boletim
//   - Linhas 2-4: dados gerais (Cliente, Local, Contratado, Nº DJ, Centro de custo,
//                 Período de medição). A posição exata pode variar.
//   - Cabeçalho da tabela em alguma linha entre 4 e 10 com colunas:
//       Item | Tag | Tipo | Modelo | Série | Horímetro Inicial | Horímetro Final |
//       Horas Trabalhadas (HF-HI) | Valor R$/h | Garantia Mínima (h) | Total a Receber (R$)
//   - Itens seguem o cabeçalho até a linha "TOTAL GERAL"
//   - Após "TOTAL GERAL", linhas seguintes são observações gerais.

import * as XLSX from "xlsx";

export const M4_LABEL = "M4 — Obras Ápia / Obra 919 SLB";

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
  const m = s.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
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

const parseCompetencia = (v: any): string | null => {
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

// Cabeçalhos M4: para reconhecer a tabela
const M4_HEADER_ALIASES: Record<string, string[]> = {
  item: ["item", "n", "no", "numero"],
  tag: ["tag"],
  tipo: ["tipo", "tipo equipamento", "tipo equip"],
  modelo: ["modelo"],
  serie: ["serie", "n serie"],
  hor_inicial: ["horimetro inicial", "hor inicial", "h inicial", "hi"],
  hor_final: ["horimetro final", "hor final", "h final", "hf"],
  horas_trabalhadas: ["horas trabalhadas hf hi", "horas trabalhadas", "ht", "ht calculado", "horas trab"],
  valor_hora: ["valor r h", "valor hora", "valor r", "r h", "vlr hora"],
  garantia_minima: ["garantia minima h", "garantia minima", "garantia"],
  total_receber: ["total a receber r", "total a receber", "total receber", "valor total"],
};

// Subconjunto distintivo do M4
const M4_REQUIRED = [
  "tag", "tipo", "modelo", "serie",
  "hor_inicial", "hor_final", "horas_trabalhadas",
  "valor_hora", "garantia_minima", "total_receber",
];

interface M4Header {
  rowIndex: number;
  colMap: Record<string, number>;
  missing: string[];
}

function detectM4Header(matrix: any[][], maxRows = 12): M4Header {
  const maxScan = Math.min(matrix.length, maxRows);
  let best: M4Header = { rowIndex: -1, colMap: {}, missing: M4_REQUIRED.slice() };
  for (let i = 0; i < maxScan; i++) {
    const row = matrix[i] ?? [];
    const cells = row.map((c: any) => normalize(c));
    const colMap: Record<string, number> = {};
    for (const [logical, aliases] of Object.entries(M4_HEADER_ALIASES)) {
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        if (!cell) continue;
        const matched = aliases.some((a) => cell === a || cell.startsWith(a + " ") || cell.endsWith(" " + a));
        if (matched && !(logical in colMap)) colMap[logical] = c;
      }
    }
    const missing = M4_REQUIRED.filter((k) => !(k in colMap));
    if (missing.length < best.missing.length) {
      best = { rowIndex: i, colMap, missing };
      if (missing.length === 0) return best;
    }
  }
  return best;
}

// Extrai um valor "label: valor" ou pega célula adjacente à da label
function findGeneralValue(matrix: any[][], headerRowIndex: number, labelAliases: string[]): string {
  const maxRow = Math.min(headerRowIndex, matrix.length);
  for (let i = 0; i < maxRow; i++) {
    const row = matrix[i] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = str(row[c]);
      if (!cell) continue;
      const cellNorm = normalize(cell);
      for (const alias of labelAliases) {
        // "Cliente: Construtora Ápia" no mesmo cell
        const inline = cell.match(new RegExp(`^\\s*${alias.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*[:\\-]\\s*(.+)$`, "i"));
        if (inline && inline[1]) return inline[1].trim();
        // label numa célula, valor na próxima
        if (cellNorm === normalize(alias) || cellNorm.startsWith(normalize(alias) + " ")) {
          for (let k = c + 1; k < row.length; k++) {
            const v = str(row[k]);
            if (v) return v;
          }
        }
      }
    }
  }
  return "";
}

// Procura por "Período: 11/04/2026 a 10/05/2026" e retorna {ini, fim}
function findPeriodo(matrix: any[][], headerRowIndex: number): { ini: string | null; fim: string | null } {
  const ALIASES = ["periodo de medicao", "periodo medicao", "periodo"];
  const maxRow = Math.min(headerRowIndex, matrix.length);
  for (let i = 0; i < maxRow; i++) {
    const row = matrix[i] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = str(row[c]);
      if (!cell) continue;
      const cellNorm = normalize(cell);
      const isLabel = ALIASES.some((a) => cellNorm === a || cellNorm.startsWith(a + " ") || cellNorm.startsWith(a + ":"));
      // valor inline?
      const inline = cell.match(/(\d{2}[/-]\d{2}[/-]\d{4})\s*(?:a|ate|-)\s*(\d{2}[/-]\d{2}[/-]\d{4})/i);
      if (inline) return { ini: parseDate(inline[1]), fim: parseDate(inline[2]) };
      if (isLabel) {
        // procurar próximas células
        const joined = row.slice(c + 1).map(str).join(" ");
        const m = joined.match(/(\d{2}[/-]\d{2}[/-]\d{4})\s*(?:a|ate|-)\s*(\d{2}[/-]\d{2}[/-]\d{4})/i);
        if (m) return { ini: parseDate(m[1]), fim: parseDate(m[2]) };
      }
    }
  }
  return { ini: null, fim: null };
}

export interface M4Linha {
  rowExcel: number;
  numero_item: string;
  tag: string;
  tipo: string;
  modelo: string;
  serie: string;
  hor_inicial: number;
  hor_final: number;
  ht_calculado: number;       // HF - HI (recalculado)
  ht_calculado_planilha: number;
  ht_informado: number;       // = ht_calculado (M4 não traz coluna separada)
  garantia_minima: number;
  horas_a_pagar: number;      // MAX(ht_informado, garantia_minima)
  tipo_pagamento: "H.G." | "H.T.";
  tipo_pagamento_desc: string;
  valor_hora: number;
  valor_final: number;        // recalculado
  valor_planilha: number;     // Total a Receber da planilha
  diferenca_calc: number;
  erros: string[];
  alertas: string[];
}

export interface M4LinhaIgnorada {
  rowExcel: number;
  motivo: string;
  preview: string;
}

export interface M4ParseResult {
  ok: boolean;
  motivo?: string;
  sheetName: string;
  headerRowIndex: number;
  colMap: Record<string, number>;

  cliente_nome: string;
  local_servico: string;
  fornecedor_nome: string;
  fornecedor_codigo: string;
  numero_dj: string;
  centro_custo: string;
  competencia: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  tipo_servico: string;

  linhas: M4Linha[];
  ignoradas: M4LinhaIgnorada[];
  observacoes_gerais: string[];
}

// Detecta se um workbook contém aba M4
export function findM4Sheet(wb: XLSX.WorkBook): string | null {
  for (const name of wb.SheetNames) {
    const nm = normalize(name);
    // Aba "Obra 919" ou similar — só consideramos abas que tenham cabeçalho M4
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
    const hdr = detectM4Header(matrix, 12);
    if (hdr.rowIndex >= 0 && hdr.missing.length === 0) return name;
    // se nome contém "obra" e quase todos os cabeçalhos batem, ainda assim aceitamos
    if (nm.includes("obra") && hdr.missing.length <= 1) return name;
  }
  return null;
}

function inferCompetenciaDoPeriodo(fim: string | null): string | null {
  if (!fim) return null;
  return fim.slice(0, 7) + "-01";
}

export function parseM4(wb: XLSX.WorkBook, sheetName: string): M4ParseResult {
  const sheet = wb.Sheets[sheetName];
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
  const hdr = detectM4Header(matrix, 12);

  const empty: M4ParseResult = {
    ok: false,
    sheetName, headerRowIndex: hdr.rowIndex, colMap: hdr.colMap,
    cliente_nome: "", local_servico: "",
    fornecedor_nome: "", fornecedor_codigo: "",
    numero_dj: "", centro_custo: "",
    competencia: null, periodo_inicio: null, periodo_fim: null,
    tipo_servico: "Terraplenagem",
    linhas: [], ignoradas: [], observacoes_gerais: [],
  };

  if (hdr.rowIndex < 0 || hdr.missing.length > 0) {
    return { ...empty, motivo: `Cabeçalho M4 não localizado. Faltam: ${hdr.missing.join(", ")}` };
  }

  // ---------- Dados gerais ----------
  const clienteRaw = findGeneralValue(matrix, hdr.rowIndex, ["cliente", "contratante"]);
  const localRaw = findGeneralValue(matrix, hdr.rowIndex, ["local", "local do servico", "local da obra", "obra"]);
  const contratadoRaw = findGeneralValue(matrix, hdr.rowIndex, ["contratado", "fornecedor", "locadora"]);
  const djRaw = findGeneralValue(matrix, hdr.rowIndex, ["n dj", "no dj", "numero dj", "dj", "contrato"]);
  const ccRaw = findGeneralValue(matrix, hdr.rowIndex, ["centro de custo", "centro custo", "cc"]);
  const competenciaRaw = findGeneralValue(matrix, hdr.rowIndex, ["competencia"]);
  const periodo = findPeriodo(matrix, hdr.rowIndex);

  // Fornecedor pode ter "Nome | Código"
  let fornecedor_nome = contratadoRaw;
  let fornecedor_codigo = "";
  const mPipe = contratadoRaw.match(/^(.*?)[\s]*\|[\s]*([^|]+?)\s*$/);
  if (mPipe) {
    fornecedor_nome = mPipe[1].trim();
    fornecedor_codigo = mPipe[2].trim();
  }

  // Normalizações leves de texto
  const normalizeTexto = (s: string) =>
    s.replace(/\bCAMINHAO\b/gi, "CAMINHÃO")
     .replace(/\bCONSTRUCOES\b/gi, "CONSTRUÇÕES")
     .replace(/\bAPIA\b/gi, "Ápia");

  fornecedor_nome = normalizeTexto(fornecedor_nome).trim();
  const cliente_nome = normalizeTexto(clienteRaw).trim();
  const local_servico = localRaw.trim();
  const numero_dj = djRaw.trim();
  const centro_custo = ccRaw.trim();

  let competencia = parseCompetencia(competenciaRaw);
  if (!competencia && periodo.fim) competencia = inferCompetenciaDoPeriodo(periodo.fim);

  // ---------- Itens ----------
  const cm = hdr.colMap;
  const get = (row: any[], k: string) => (k in cm ? row[cm[k]] : "");
  const linhas: M4Linha[] = [];
  const ignoradas: M4LinhaIgnorada[] = [];
  const observacoes_gerais: string[] = [];

  let totalGeralEncontrado = false;

  for (let i = hdr.rowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const rowExcel = i + 1;
    const hasAny = row.some((c) => str(c) !== "");
    if (!hasAny) continue;

    const firstNonEmpty = row.find((c) => str(c) !== "");
    const firstNorm = normalize(firstNonEmpty);
    const joined = row.map(str).filter(Boolean).join(" ").trim();

    // Detecta TOTAL GERAL — para de ler itens
    if (!totalGeralEncontrado && (firstNorm.startsWith("total geral") || normalize(joined).includes("total geral"))) {
      totalGeralEncontrado = true;
      ignoradas.push({ rowExcel, motivo: "Linha TOTAL GERAL — fim dos itens", preview: joined.slice(0, 160) });
      continue;
    }

    // Após TOTAL GERAL, capturamos como observações gerais
    if (totalGeralEncontrado) {
      if (joined) observacoes_gerais.push(joined);
      continue;
    }

    const tag = str(get(row, "tag"));
    const serie = str(get(row, "serie"));
    const tipo = normalizeTexto(str(get(row, "tipo"))).toUpperCase();
    const modelo = str(get(row, "modelo"));
    const hor_inicial = num(get(row, "hor_inicial"));
    const hor_final = num(get(row, "hor_final"));
    const valor_hora = num(get(row, "valor_hora"));
    const horas_trab_planilha = num(get(row, "horas_trabalhadas"));
    const garantia_minima = num(get(row, "garantia_minima"));
    const valor_planilha = num(get(row, "total_receber"));
    const numero_item = str(get(row, "item"));

    // Linhas claramente sem dado de equipamento → ignorar
    const semCamposChave = !tag && !serie && !hor_inicial && !hor_final && !valor_hora && !valor_planilha;
    if (semCamposChave) {
      ignoradas.push({
        rowExcel,
        motivo: "Linha sem dados de equipamento",
        preview: joined.slice(0, 160),
      });
      continue;
    }

    const faltas: string[] = [];
    if (!tag) faltas.push("Tag ausente");
    if (!serie) faltas.push("Série ausente");
    if (!hor_inicial && !hor_final) faltas.push("Horímetros ausentes");
    if (!valor_hora) faltas.push("Valor/hora ausente");
    if (faltas.length >= 2) {
      ignoradas.push({
        rowExcel,
        motivo: faltas.join(" · "),
        preview: [tag, serie, tipo, modelo].filter(Boolean).join(" | ").slice(0, 160),
      });
      continue;
    }

    const ht_calc = hor_final - hor_inicial;
    const ht_informado = ht_calc; // M4 não tem coluna separada
    const horas_a_pagar = Math.max(ht_informado, garantia_minima);
    const valor_final_calc = horas_a_pagar * valor_hora;
    const diferenca_calc = valor_planilha ? (valor_planilha - valor_final_calc) : 0;

    const tipo_pagamento: "H.G." | "H.T." =
      garantia_minima > ht_informado && garantia_minima > 0 ? "H.G." : "H.T.";
    const tipo_pagamento_desc = tipo_pagamento === "H.G." ? "Horas Garantidas" : "Horas Trabalhadas";

    const erros: string[] = [];
    const alertas: string[] = [];
    if (!tag) erros.push("Tag ausente");
    if (!serie) erros.push("Série ausente");
    if (!tipo) erros.push("Tipo equipamento ausente");
    if (!modelo) erros.push("Modelo ausente");
    if (!hor_inicial && !hor_final) erros.push("Horímetros ausentes");
    if (hor_final < hor_inicial) erros.push("Horímetro final < inicial");
    if (!valor_hora) erros.push("Valor/Hora ausente");
    if (garantia_minima === 0) alertas.push("Garantia mínima = 0");
    if (horas_trab_planilha && Math.abs(horas_trab_planilha - ht_calc) > 0.01) {
      alertas.push(`Divergência HT planilha (${horas_trab_planilha.toFixed(2)}) vs calculado (${ht_calc.toFixed(2)})`);
    }
    if (valor_planilha && Math.abs(diferenca_calc) > 0.10) {
      alertas.push("Divergência entre valor da planilha e valor recalculado.");
    }

    linhas.push({
      rowExcel,
      numero_item,
      tag, tipo, modelo, serie,
      hor_inicial, hor_final,
      ht_calculado: ht_calc,
      ht_calculado_planilha: horas_trab_planilha,
      ht_informado,
      garantia_minima,
      horas_a_pagar,
      tipo_pagamento, tipo_pagamento_desc,
      valor_hora,
      valor_final: valor_final_calc,
      valor_planilha,
      diferenca_calc,
      erros, alertas,
    });
  }

  return {
    ok: true,
    sheetName,
    headerRowIndex: hdr.rowIndex,
    colMap: hdr.colMap,
    cliente_nome,
    local_servico,
    fornecedor_nome: fornecedor_nome || "MC TERRAPLENAGEM E CONSTRUÇÕES LTDA",
    fornecedor_codigo,
    numero_dj,
    centro_custo,
    competencia,
    periodo_inicio: periodo.ini,
    periodo_fim: periodo.fim,
    tipo_servico: "Terraplenagem",
    linhas, ignoradas, observacoes_gerais,
  };
}
