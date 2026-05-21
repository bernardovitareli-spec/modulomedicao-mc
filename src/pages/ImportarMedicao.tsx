import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { ImportConflitoDialog, ConflitoMedicao, ConflitoResolucao } from "@/components/medicao/ImportConflitoDialog";
import {
  findM3Sheet, parseM3, periodoApiaPorCompetencia, M3_LABEL,
  type M3ParseResult, type M3Linha,
} from "@/lib/m3Parser";
import { findM4Sheet, parseM4, M4_LABEL, type M4ParseResult, type M4Linha } from "@/lib/m4Parser";

const TIPOS_SERVICO_M1 = [
  "Locação de equipamentos",
  "Transporte",
  "Terraplenagem",
  "Plano de chuva",
  "Outro",
];
import { toast } from "sonner";
import { fmtBRL, fmtCompetencia, fmtDate, fmtNum } from "@/lib/format";
import { calcularItem } from "@/lib/calculo";

const SHEET_MODELO_1 = "BASE DE DADOS";
const SHEET_MODELO_2 = "Template Medição";

// ---------- Normalização ----------
const normalize = (s: any): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Sinônimos por campo lógico (forma normalizada)
const COLUMN_ALIASES: Record<string, string[]> = {
  mes_ref: ["mes referencia", "mes ref", "mes", "competencia", "referencia"],
  numero_dj: ["n dj", "no dj", "numero dj", "num dj", "dj"],
  contratado: ["contratado", "contratante", "cliente", "razao social"],
  cnpj: ["cnpj"],
  tipo_servico: ["tipo servico", "servico"],
  tipo_equip: ["tipo equipamento", "tipo equip", "tipo de equipamento", "tipoequip"],
  modelo: ["modelo"],
  serie: ["serie", "n serie", "numero serie"],
  tag: ["tag", "patrimonio"],
  centro_custo: ["centro custo", "cc"],
  periodo_inicio: ["periodo inicio", "per inicio", "data inicio periodo"],
  periodo_fim: ["periodo fim", "per fim", "data fim periodo"],
  inicio_op: ["inicio operacao", "inicio op", "data inicio"],
  termino_contrato: ["termino contrato", "fim contrato", "data fim"],
  hor_inicial: ["h inicial", "hor inicial", "horimetro inicial"],
  hor_final: ["h final", "hor final", "horimetro final"],
  ht_informado: ["ht informado boletim", "ht informado", "horas informadas", "ht"],
  garantia: ["garantia contratual", "garantia", "garantia minima"],
  horas_disp: ["horas disposicao", "h disposicao", "disposicao"],
  horas_mec: ["h mecanicas", "horas mecanicas", "mecanicas"],
  complementares: ["complementares", "complemento"],
  tipo_pagamento: ["tipo pagamento"],
  valor_hora: ["valor hora r", "valor hora", "valor por hora", "vlr hora", "r hora"],
  desc_manutencao: ["desc manutencao r", "desc manutencao", "desconto manutencao", "descontos", "desconto"],
  periodo_chuvoso: ["periodo chuvoso s n", "periodo chuvoso", "chuvoso s n", "chuvoso"],
  excecao_chuvoso: ["excecao chuvoso s n", "excecao chuvoso", "exc chuvoso", "excecao chuva"],
  observacoes: ["observacoes", "obs"],
  medicao_planilha: ["medicao final", "medicao", "valor medicao", "valor final medicao", "total medicao", "total medição"],
};

// Modelo 1 (BASE DE DADOS) requer mes_ref e desc_manutencao
const REQUIRED_M1 = ["mes_ref", "numero_dj", "contratado", "serie", "tag", "valor_hora"];
// Modelo 2 (Template Medição) possui layout fixo A:W; não pode depender de aliases soltos.
const REQUIRED_M2 = ["contratado", "cnpj", "numero_dj", "tipo_servico", "centro_custo", "periodo_inicio", "periodo_fim", "tipo_equip", "modelo", "serie", "tag", "hor_inicial", "hor_final", "ht_informado", "garantia", "periodo_chuvoso", "excecao_chuvoso", "horas_mec", "valor_hora", "complementares", "observacoes", "inicio_op", "termino_contrato"];

const M2_FIXED_COL_MAP: Record<string, number> = {
  contratado: 0, cnpj: 1, numero_dj: 2, tipo_servico: 3, centro_custo: 4,
  periodo_inicio: 5, periodo_fim: 6, tipo_equip: 7, modelo: 8, serie: 9, tag: 10,
  hor_inicial: 11, hor_final: 12, ht_informado: 13, garantia: 14,
  periodo_chuvoso: 15, excecao_chuvoso: 16, horas_mec: 17, valor_hora: 18,
  complementares: 19, observacoes: 20, inicio_op: 21, termino_contrato: 22,
};

const M2_EXPECTED_HEADERS: Record<string, string[]> = {
  contratado: ["contratante"], cnpj: ["cnpj"], numero_dj: ["n dj", "no dj", "numero dj"],
  tipo_servico: ["tipo servico"], centro_custo: ["centro custo"], periodo_inicio: ["periodo inicio"],
  periodo_fim: ["periodo fim"], tipo_equip: ["tipo equip"], modelo: ["modelo"], serie: ["serie"], tag: ["tag"],
  hor_inicial: ["h inicial"], hor_final: ["h final"], ht_informado: ["ht informado"],
  garantia: ["garantia contratual"], periodo_chuvoso: ["periodo chuvoso s n", "periodo chuvoso"],
  excecao_chuvoso: ["excecao chuvoso s n", "excecao chuvoso"], horas_mec: ["h mecanicas"],
  valor_hora: ["valor hora"], complementares: ["complementares"], observacoes: ["observacoes"],
  inicio_op: ["inicio operacao"], termino_contrato: ["termino contrato"],
};

// ---------- Parsers ----------
const num = (v: any): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/[R$\s]/g, "");
  // remove thousand separators
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
  // 2026-04 ou 2026-04-XX
  let m = raw.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  // 04/2026 ou 4-2026
  m = raw.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
  // dd/mm/yyyy
  const d = parseDate(raw);
  if (d) return d.slice(0, 7) + "-01";
  // "Abril/2026", "abril de 2026", "abr 2026"
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

const lastDayOfMonth = (yyyymm01: string) => {
  const [y, m] = yyyymm01.split("-").map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
};

// ---------- Detecção de cabeçalho ----------
interface HeaderInfo {
  rowIndex: number; // 0-based no array de linhas brutas
  colMap: Record<string, number>; // campo lógico -> coluna
  missingRequired: string[];
}

function detectHeader(matrix: any[][], required: string[], maxRows = 30): HeaderInfo {
  const maxScan = Math.min(matrix.length, maxRows);
  let best: HeaderInfo = { rowIndex: -1, colMap: {}, missingRequired: required.slice() };
  for (let i = 0; i < maxScan; i++) {
    const row = matrix[i] ?? [];
    const normCells = row.map((c) => normalize(c));
    const colMap: Record<string, number> = {};
    for (const [logical, aliases] of Object.entries(COLUMN_ALIASES)) {
      for (let c = 0; c < normCells.length; c++) {
        const cell = normCells[c];
        if (!cell) continue;
        // Match exato OU cabeçalho começa com alias seguido de espaço (evita "tipo servico" casar com "tipo")
        const matched = aliases.some((a) => cell === a || cell.startsWith(a + " ") || cell.endsWith(" " + a));
        if (matched && !(logical in colMap)) {
          colMap[logical] = c;
        }
      }
    }
    const missing = required.filter((k) => !(k in colMap));
    if (missing.length < best.missingRequired.length) {
      best = { rowIndex: i, colMap, missingRequired: missing };
      if (missing.length === 0) return best;
    }
  }
  return best;
}

function detectHeaderM2(matrix: any[][], maxRows = 5): HeaderInfo {
  const maxScan = Math.min(matrix.length, maxRows);
  let best: HeaderInfo = { rowIndex: -1, colMap: { ...M2_FIXED_COL_MAP }, missingRequired: REQUIRED_M2.slice() };
  for (let i = 0; i < maxScan; i++) {
    const row = matrix[i] ?? [];
    const missing = REQUIRED_M2.filter((field) => {
      const col = M2_FIXED_COL_MAP[field];
      const cell = normalize(row[col]);
      return !(M2_EXPECTED_HEADERS[field] ?? []).some((h) => cell === h || cell.startsWith(h + " "));
    });
    if (missing.length < best.missingRequired.length) {
      best = { rowIndex: i, colMap: { ...M2_FIXED_COL_MAP }, missingRequired: missing };
      if (missing.length === 0) return best;
    }
  }
  return best;
}

// ---------- Modelo ----------
type ModeloLayout = "M1" | "M2" | "M3" | "M4";

const parseSN = (v: any): boolean => {
  const s = normalize(v);
  return s === "s" || s === "sim" || s === "yes" || s === "true" || s === "1";
};

interface LinhaLida {
  rowExcel: number;
  raw: any[];
  mes_ref: string | null;
  numero_dj: string;
  contratado: string;
  codigo_cliente: string;
  cnpj: string;
  tipo_servico: string;
  tipo_equip: string;
  modelo: string;
  serie: string;
  tag: string;
  centro_custo: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  inicio_op: string | null;
  termino_contrato: string | null;
  hor_inicial: number;
  hor_final: number;
  ht_calculado: number;
  ht_informado: number;
  divergencia_ht: number;
  garantia: number;
  horas_disp: number;
  horas_mec: number;
  complementares: number;
  valor_hora: number;
  desc_manutencao: number;
  periodo_chuvoso: boolean;
  excecao_chuvoso: number;
  observacoes: string;
  tipo_pagamento: string;
  horas_liquidas: number;
  horas_a_pagar: number;
  valor_final: number;
  valor_planilha: number;
  diferenca_calc: number;
  erros: string[];
  alertas: string[];
}

interface LinhaIgnorada {
  rowExcel: number;
  motivo: string;
  preview: string;
}

export default function ImportarMedicao() {
  const navigate = useNavigate();
  const [filename, setFilename] = useState("");
  const [linhas, setLinhas] = useState<LinhaLida[]>([]);
  const [ignoradas, setIgnoradas] = useState<LinhaIgnorada[]>([]);
  const [headerInfo, setHeaderInfo] = useState<HeaderInfo | null>(null);
  const [headerError, setHeaderError] = useState<string>("");
  const [modelo, setModelo] = useState<ModeloLayout | null>(null);
  const [sheetUsed, setSheetUsed] = useState<string>("");
  const [importing, setImporting] = useState(false);
  // Overrides por contrato (Nº DJ) — usados especialmente no Modelo M1 onde
  // CNPJ, tipo_servico, periodo_inicio e periodo_fim podem
  // não vir na planilha e precisam ser informados antes de confirmar.
  // No M1, o campo "Contratado" da planilha é o FORNECEDOR/LOCADORA — o
  // CLIENTE/CONTRATANTE precisa ser selecionado pelo usuário.
  const [overrides, setOverrides] = useState<Record<string, {
    cnpj?: string;
    tipo_servico?: string;
    periodo_inicio?: string;
    periodo_fim?: string;
    cliente_id?: string;       // M1: cliente/contratante real
  }>>({});
  const [clientesAtivos, setClientesAtivos] = useState<{ id: string; razao_social: string }[]>([]);
  const [confirmDivergencia, setConfirmDivergencia] = useState(false);
  const [conflitos, setConflitos] = useState<ConflitoMedicao[]>([]);
  const [conflitoOpen, setConflitoOpen] = useState(false);
  // contexto preparado p/ executar importação após resolução de conflitos
  const [pendingCtx, setPendingCtx] = useState<any>(null);

  // ----- M3 (Obras Ápia) -----
  // Configurações por número DJ — definidas no card de pré-visualização do M3.
  const [m3Settings, setM3Settings] = useState<Record<string, {
    cliente_id?: string;
    fornecedor_nome?: string;
    fornecedor_codigo?: string;
    centro_custo?: string;
    competencia?: string;     // YYYY-MM-01
    periodo_inicio?: string;  // YYYY-MM-DD
    periodo_fim?: string;
    tipo_servico?: string;
  }>>({});
  const [m3Result, setM3Result] = useState<M3ParseResult | null>(null);

  // ----- M4 (Obras Ápia / Obra 919 SLB) -----
  const [m4Settings, setM4Settings] = useState<Record<string, {
    cliente_id?: string;
    fornecedor_nome?: string;
    fornecedor_codigo?: string;
    centro_custo?: string;
    local_servico?: string;
    competencia?: string;
    periodo_inicio?: string;
    periodo_fim?: string;
    tipo_servico?: string;
  }>>({});
  const [m4Result, setM4Result] = useState<M4ParseResult | null>(null);

  const m4LinhaToLinhaLida = (l: M4Linha, opts: {
    competencia: string;
    centro_custo: string;
    numero_dj: string;
    fornecedor_nome: string;
    fornecedor_codigo: string;
    periodo_inicio: string;
    periodo_fim: string;
  }): LinhaLida => ({
    rowExcel: l.rowExcel,
    raw: [],
    mes_ref: opts.competencia,
    numero_dj: opts.numero_dj,
    contratado: opts.fornecedor_nome,
    codigo_cliente: opts.fornecedor_codigo,
    cnpj: "",
    tipo_servico: "Terraplenagem",
    tipo_equip: l.tipo,
    modelo: l.modelo,
    serie: l.serie,
    tag: l.tag,
    centro_custo: opts.centro_custo,
    periodo_inicio: opts.periodo_inicio || null,
    periodo_fim: opts.periodo_fim || null,
    inicio_op: null,
    termino_contrato: null,
    hor_inicial: l.hor_inicial,
    hor_final: l.hor_final,
    ht_calculado: l.ht_calculado,
    ht_informado: l.ht_informado,
    divergencia_ht: 0,
    garantia: l.garantia_minima,
    horas_disp: 0,
    horas_mec: 0,
    complementares: 0,
    valor_hora: l.valor_hora,
    desc_manutencao: 0,
    periodo_chuvoso: false,
    excecao_chuvoso: 0,
    observacoes: "",
    tipo_pagamento: l.tipo_pagamento,
    horas_liquidas: l.ht_informado,
    horas_a_pagar: l.horas_a_pagar,
    valor_final: l.valor_final,
    valor_planilha: l.valor_planilha,
    diferenca_calc: l.diferenca_calc,
    erros: l.erros.slice(),
    alertas: l.alertas.slice(),
  });

  const processarM4 = async (wb: XLSX.WorkBook, sheetName: string) => {
    const result = parseM4(wb, sheetName);
    if (!result.ok) {
      setHeaderError(result.motivo ?? "Não foi possível ler M4");
      toast.error(result.motivo ?? "Não foi possível ler M4");
      return;
    }
    setModelo("M4");
    setSheetUsed(sheetName);
    setHeaderInfo({ rowIndex: result.headerRowIndex, colMap: result.colMap, missingRequired: [] });
    setM4Result(result);

    const { data: cliAtivos } = await supabase
      .from("clientes").select("id, razao_social").eq("status", "ativo").order("razao_social");
    setClientesAtivos(cliAtivos ?? []);
    const apia = (cliAtivos ?? []).find((c: any) => {
      const nm = String(c.razao_social).toUpperCase();
      return nm.includes("APIA") || nm.includes("ÁPIA");
    });

    const dj = result.numero_dj || "—";
    const settings = {
      [dj]: {
        cliente_id: apia?.id || "",
        fornecedor_nome: result.fornecedor_nome,
        fornecedor_codigo: result.fornecedor_codigo,
        centro_custo: result.centro_custo,
        local_servico: result.local_servico,
        competencia: result.competencia || "",
        periodo_inicio: result.periodo_inicio || "",
        periodo_fim: result.periodo_fim || "",
        tipo_servico: result.tipo_servico,
      },
    };
    setM4Settings(settings);

    const lidas: LinhaLida[] = result.linhas.map((l) =>
      m4LinhaToLinhaLida(l, {
        competencia: settings[dj]!.competencia!,
        centro_custo: settings[dj]!.centro_custo!,
        numero_dj: dj,
        fornecedor_nome: settings[dj]!.fornecedor_nome!,
        fornecedor_codigo: settings[dj]!.fornecedor_codigo!,
        periodo_inicio: settings[dj]!.periodo_inicio!,
        periodo_fim: settings[dj]!.periodo_fim!,
      }),
    );

    setLinhas(lidas);
    setIgnoradas(result.ignoradas.map((i) => ({ rowExcel: i.rowExcel, motivo: i.motivo, preview: i.preview })));
    toast.success(`Modelo M4 • ${lidas.length} linha(s) lidas, ${result.ignoradas.length} ignorada(s).`);
  };

  // Converte uma linha M3 para o formato LinhaLida usado pelo restante do fluxo.
  const m3LinhaToLinhaLida = (l: M3Linha, opts: {
    competencia: string;
    centro_custo: string;
  }): LinhaLida => {
    return {
      rowExcel: l.rowExcel,
      raw: [],
      mes_ref: opts.competencia || l.mes_ref,
      numero_dj: l.numero_dj,
      contratado: l.fornecedor_nome,        // No M3, "Contratado" é o fornecedor.
      codigo_cliente: l.fornecedor_codigo,  // Código do fornecedor (reaproveitado).
      cnpj: "",
      tipo_servico: "Locação de equipamentos",
      tipo_equip: l.tipo_equip,
      modelo: l.modelo,
      serie: l.serie,
      tag: l.tag,
      centro_custo: opts.centro_custo || l.centro_custo,
      periodo_inicio: null,                  // Período é fixado em m3Settings (override).
      periodo_fim: null,
      inicio_op: l.inicio_op,
      termino_contrato: l.termino_contrato,
      hor_inicial: l.hor_inicial,
      hor_final: l.hor_final,
      ht_calculado: l.ht_calculado,
      ht_informado: l.ht_informado,
      divergencia_ht: l.divergencia_ht,
      garantia: l.garantia_aplicada,         // Usa garantia já aplicada (proporcional/real).
      horas_disp: 0,
      horas_mec: l.horas_mec,
      complementares: 0,
      valor_hora: l.valor_hora,
      desc_manutencao: 0,
      periodo_chuvoso: l.periodo_chuvoso,
      excecao_chuvoso: l.excecao_chuvoso ? 1 : 0,
      observacoes: l.observacoes,
      tipo_pagamento: l.tipo_pagamento,
      horas_liquidas: l.horas_pagar_liquido,
      horas_a_pagar: l.horas_pagar_bruto,
      valor_final: l.valor_final,
      valor_planilha: l.valor_planilha,
      diferenca_calc: l.diferenca_calc,
      erros: l.erros.slice(),
      alertas: l.alertas.slice(),
    };
  };

  const processarM3 = async (wb: XLSX.WorkBook, sheetName: string) => {
    const result = parseM3(wb, sheetName);
    if (!result.ok) {
      setHeaderError(result.motivo ?? "Não foi possível ler M3");
      toast.error(result.motivo ?? "Não foi possível ler M3");
      return;
    }
    setModelo("M3");
    setSheetUsed(sheetName);
    setHeaderInfo({ rowIndex: result.headerRowIndex, colMap: result.colMap, missingRequired: [] });
    setM3Result(result);

    // Carrega clientes ativos e tenta sugerir Construtora Ápia.
    const { data: cliAtivos } = await supabase
      .from("clientes").select("id, razao_social").eq("status", "ativo").order("razao_social");
    setClientesAtivos(cliAtivos ?? []);
    const apia = (cliAtivos ?? []).find((c: any) =>
      ["CONSTRUTORA ÁPIA", "CONSTRUTORA APIA"].includes(String(c.razao_social).toUpperCase()));

    const competencia = result.competenciaSugerida ?? "";
    const periodo = competencia ? periodoApiaPorCompetencia(competencia) : null;

    const settings: typeof m3Settings = {};
    const djs = Array.from(new Set(result.linhas.map((l) => l.numero_dj).filter(Boolean)));
    for (const dj of djs) {
      const linhaRef = result.linhas.find((l) => l.numero_dj === dj);
      settings[dj] = {
        cliente_id: apia?.id || "",
        fornecedor_nome: linhaRef?.fornecedor_nome || result.fornecedorNome,
        fornecedor_codigo: linhaRef?.fornecedor_codigo || result.fornecedorCodigo,
        centro_custo: linhaRef?.centro_custo || result.centroCustoSugerido,
        competencia,
        periodo_inicio: periodo?.ini ?? "",
        periodo_fim: periodo?.fim ?? "",
        tipo_servico: "Locação de equipamentos",
      };
    }
    setM3Settings(settings);

    // Converte para LinhaLida e mantém o restante do fluxo (resumos / conflito / executar).
    const lidas: LinhaLida[] = result.linhas.map((l) =>
      m3LinhaToLinhaLida(l, {
        competencia: settings[l.numero_dj]?.competencia || competencia,
        centro_custo: settings[l.numero_dj]?.centro_custo || result.centroCustoSugerido,
      }),
    );

    setLinhas(lidas);
    setIgnoradas(result.ignoradas.map((i) => ({ rowExcel: i.rowExcel, motivo: i.motivo, preview: i.preview })));
    toast.success(`Modelo M3 • ${lidas.length} linha(s) lidas, ${result.ignoradas.length} ignorada(s).`);
  };

  const onFile = async (file: File) => {
    setFilename(file.name);
    setLinhas([]); setIgnoradas([]); setHeaderError(""); setHeaderInfo(null); setModelo(null); setSheetUsed(""); setOverrides({}); setConfirmDivergencia(false);
    setM3Settings({}); setM3Result(null);
    setM4Settings({}); setM4Result(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });

      const sheetM1 = wb.SheetNames.find((n) => normalize(n) === normalize(SHEET_MODELO_1));
      const sheetM2 = wb.SheetNames.find((n) => normalize(n) === normalize(SHEET_MODELO_2));

      // M3/M4 — Obras Ápia: só considerados quando NÃO há aba M1/M2.
      if (!sheetM1 && !sheetM2) {
        // M4 tem prioridade sobre M3 quando há aba com cabeçalho M4 específico
        const sheetM4 = findM4Sheet(wb);
        if (sheetM4) {
          await processarM4(wb, sheetM4);
          return;
        }
        const sheetM3 = findM3Sheet(wb);
        if (sheetM3) {
          await processarM3(wb, sheetM3);
          return;
        }
      }

      let modeloDetectado: ModeloLayout | null = null;
      let sheetName = "";
      let headerSearchRows = 30;
      let required: string[] = REQUIRED_M1;

      if (sheetM1) {
        modeloDetectado = "M1"; sheetName = sheetM1; required = REQUIRED_M1; headerSearchRows = 30;
      } else if (sheetM2) {
        modeloDetectado = "M2"; sheetName = sheetM2; required = REQUIRED_M2; headerSearchRows = 5;
      } else {
        sheetName = wb.SheetNames[0];
      }

      const sheet = wb.Sheets[sheetName];
      const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });

      let hdr: HeaderInfo;
      if (!modeloDetectado) {
        const tryM2 = detectHeaderM2(matrix, 5);
        if (tryM2.rowIndex >= 0 && tryM2.missingRequired.length === 0) {
          modeloDetectado = "M2"; required = REQUIRED_M2; hdr = detectHeaderM2(matrix, 5);
        } else {
          const tryM1 = detectHeader(matrix, REQUIRED_M1, 30);
          if (tryM1.rowIndex >= 0 && tryM1.missingRequired.length === 0) {
            modeloDetectado = "M1"; required = REQUIRED_M1; hdr = tryM1;
          } else {
            const msg = `Não foi possível identificar o layout da planilha. Esperadas as abas "${SHEET_MODELO_1}" ou "${SHEET_MODELO_2}", ou um cabeçalho reconhecível.`;
            setHeaderError(msg);
            toast.error(msg);
            setHeaderInfo(tryM1.missingRequired.length <= tryM2.missingRequired.length ? tryM1 : tryM2);
            return;
          }
        }
      } else {
        hdr = modeloDetectado === "M2" ? detectHeaderM2(matrix, headerSearchRows) : detectHeader(matrix, required, headerSearchRows);
      }

      setModelo(modeloDetectado);
      setSheetUsed(sheetName);
      setHeaderInfo(hdr);

      if (hdr.rowIndex < 0 || hdr.missingRequired.length > 0) {
        const msg = `Modelo ${modeloDetectado} (aba "${sheetName}"): cabeçalho não localizado. Colunas obrigatórias ausentes: ${hdr.missingRequired.join(", ")}`;
        setHeaderError(msg);
        toast.error(msg);
        return;
      }

      const cm = hdr.colMap;
      const get = (row: any[], k: string) => (k in cm ? row[cm[k]] : "");

      const lidas: LinhaLida[] = [];
      const ign: LinhaIgnorada[] = [];

      for (let i = hdr.rowIndex + 1; i < matrix.length; i++) {
        const row = matrix[i] ?? [];
        const rowExcel = i + 1;

        const hasAny = row.some((c) => str(c) !== "");
        if (!hasAny) { continue; }

        const firstNonEmpty = row.find((c) => str(c) !== "");
        const firstNorm = normalize(firstNonEmpty);
        if (firstNorm.startsWith("total") || firstNorm === "subtotal") {
          ign.push({ rowExcel, motivo: "Linha de TOTAL", preview: str(firstNonEmpty) });
          continue;
        }

        const numero_dj = str(get(row, "numero_dj"));
        const contratadoRaw = str(get(row, "contratado"));
        // Extrair código do cliente quando vier no formato "Nome | Código"
        let contratado = contratadoRaw;
        let codigo_cliente = "";
        const mPipe = contratadoRaw.match(/^(.*?)[\s]*\|[\s]*([^|]+?)\s*$/);
        if (mPipe) {
          contratado = mPipe[1].trim();
          codigo_cliente = mPipe[2].trim();
        }
        const cnpj = str(get(row, "cnpj"));
        const serie = str(get(row, "serie"));
        const tag = str(get(row, "tag"));
        const valor_hora = num(get(row, "valor_hora"));

        const trat = (raw: any) => (raw === 0 || raw === "0") ? null : parseDate(raw);
        const periodo_inicio = trat(get(row, "periodo_inicio"));
        const periodo_fim = trat(get(row, "periodo_fim"));
        const inicio_op = trat(get(row, "inicio_op"));
        const termino_contrato = trat(get(row, "termino_contrato"));

        let mes_ref: string | null = null;
        if (modeloDetectado === "M1") {
          mes_ref = parseMesRef(get(row, "mes_ref"));
        } else if (periodo_fim) {
          mes_ref = periodo_fim.slice(0, 7) + "-01";
        }

        const faltando: string[] = [];
        if (!numero_dj) faltando.push("Nº DJ");
        if (!contratado) faltando.push("Contratado");
        if (!serie) faltando.push("Série");
        if (!tag) faltando.push("Tag");
        if (!valor_hora) faltando.push("Valor/Hora");
        if (modeloDetectado === "M2" && !periodo_inicio) faltando.push("Período Início");
        if (modeloDetectado === "M2" && !periodo_fim) faltando.push("Período Fim");
        if (modeloDetectado === "M2" && !str(get(row, "tipo_equip"))) faltando.push("Tipo Equip.");
        if (modeloDetectado === "M2" && !str(get(row, "modelo"))) faltando.push("Modelo");
        if (faltando.length) {
          ign.push({
            rowExcel,
            motivo: `Sem ${faltando.join(", ")}`,
            preview: [numero_dj, contratado, serie, tag].filter(Boolean).join(" • ") || str(firstNonEmpty),
          });
          continue;
        }

        const hor_inicial = num(get(row, "hor_inicial"));
        const hor_final = num(get(row, "hor_final"));
        const ht_informado = num(get(row, "ht_informado"));
        const garantia = num(get(row, "garantia"));
        const horas_disp = num(get(row, "horas_disp"));
        const horas_mec = num(get(row, "horas_mec"));
        const complementares = num(get(row, "complementares"));
        const desc_manutencao = modeloDetectado === "M2" ? 0 : num(get(row, "desc_manutencao"));
        const periodo_chuvoso = parseSN(get(row, "periodo_chuvoso"));
        const excecao_raw = get(row, "excecao_chuvoso");
        const excecao_chuvoso = modeloDetectado === "M2"
          ? (parseSN(excecao_raw) ? 1 : 0)
          : num(excecao_raw);

        const ht_calculado = hor_final - hor_inicial;
        const divergencia_ht = ht_calculado - ht_informado;
        const horas_liquidas = Math.max(0, ht_informado - horas_mec);
        const horas_a_pagar = Math.max(horas_liquidas, garantia);
        const valor_final = horas_a_pagar * valor_hora + complementares - desc_manutencao;
        const valor_planilha = num(get(row, "medicao_planilha"));
        const diferenca_calc = valor_planilha ? (valor_planilha - valor_final) : 0;

        const erros: string[] = [];
        const alertas: string[] = [];
        if (!mes_ref) erros.push("Competência inválida");
        if (modeloDetectado === "M2" && !periodo_inicio) erros.push("Período início inválido");
        if (modeloDetectado === "M2" && !periodo_fim) erros.push("Período fim inválido");
        if (hor_final < hor_inicial) erros.push("Horímetro final < inicial");
        if (!garantia) alertas.push("Garantia contratual ausente");
        if (Math.abs(divergencia_ht) > 0.01) alertas.push(`Divergência HT: ${fmtNum(divergencia_ht)}h`);
        if (valor_planilha && Math.abs(diferenca_calc) > 0.10) {
          alertas.push("Divergência entre valor da planilha e valor recalculado.");
        }

        const tipo_equip_raw = str(get(row, "tipo_equip"));
        const tipo_equip = tipo_equip_raw
          ? tipo_equip_raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
          : "";

        lidas.push({
          rowExcel, raw: row,
          mes_ref, numero_dj, contratado, codigo_cliente, cnpj,
          tipo_servico: str(get(row, "tipo_servico")),
          tipo_equip,
          modelo: str(get(row, "modelo")),
          serie, tag,
          centro_custo: str(get(row, "centro_custo")),
          periodo_inicio, periodo_fim,
          inicio_op, termino_contrato,
          hor_inicial, hor_final, ht_calculado, ht_informado, divergencia_ht,
          garantia, horas_disp, horas_mec, complementares,
          valor_hora, desc_manutencao, periodo_chuvoso, excecao_chuvoso,
          observacoes: str(get(row, "observacoes")),
          tipo_pagamento: str(get(row, "tipo_pagamento")),
          horas_liquidas, horas_a_pagar, valor_final,
          valor_planilha, diferenca_calc,
          erros, alertas,
        });
      }

      const seen = new Map<string, number>();
      lidas.forEach((l, i) => {
        if (!l.mes_ref) return;
        const k = `${l.numero_dj}|${l.mes_ref}|${l.serie}|${l.tag}`;
        if (seen.has(k)) {
          l.erros.push("Duplicado (DJ+competência+Série+Tag)");
          lidas[seen.get(k)!].erros.push("Duplicado (DJ+competência+Série+Tag)");
        } else seen.set(k, i);
      });

      // Prefill de overrides M1: o "Contratado" da planilha = FORNECEDOR.
      // Cliente/Contratante deve ser selecionado (default: Construtora Ápia).
      if (modeloDetectado === "M1") {
        const ovs: typeof overrides = {};
        const djs = Array.from(new Set(lidas.map((l) => l.numero_dj).filter(Boolean)));
        const { data: cliAtivos } = await supabase
          .from("clientes").select("id, razao_social").eq("status", "ativo").order("razao_social");
        setClientesAtivos(cliAtivos ?? []);
        const apia = (cliAtivos ?? []).find((c: any) =>
          ["CONSTRUTORA ÁPIA", "CONSTRUTORA APIA"].includes(String(c.razao_social).toUpperCase()));
        for (const dj of djs) {
          const linhaRef = lidas.find((l) => l.numero_dj === dj);
          if (!linhaRef) continue;
          ovs[dj] = {
            cnpj: linhaRef.cnpj || "",
            tipo_servico: linhaRef.tipo_servico || "",
            periodo_inicio: linhaRef.periodo_inicio || "",
            periodo_fim: linhaRef.periodo_fim || "",
            cliente_id: apia?.id || "",
          };
        }
        setOverrides(ovs);
      }

      setLinhas(lidas);
      setIgnoradas(ign);
      toast.success(`Modelo ${modeloDetectado} • ${lidas.length} linha(s) lidas, ${ign.length} ignorada(s).`);
    } catch (e: any) {
      toast.error("Erro ao ler planilha: " + e.message);
    }
  };

  const validas = linhas.filter((l) => l.erros.length === 0);

  // Helpers para aplicar overrides M1 (preenchidos manualmente pelo usuário)
  const ovOf = (dj: string) => overrides[dj] ?? {};
  // Helper unificado: para M1 lê de "overrides", para M3 lê de "m3Settings", M4 de "m4Settings".
  const cfgOf = (dj: string): {
    cnpj?: string; tipo_servico?: string; periodo_inicio?: string;
    periodo_fim?: string; cliente_id?: string; centro_custo?: string;
    competencia?: string; fornecedor_nome?: string; fornecedor_codigo?: string;
    local_servico?: string;
  } => {
    if (modelo === "M3") return m3Settings[dj] ?? {};
    if (modelo === "M4") return m4Settings[dj] ?? {};
    return overrides[dj] ?? {};
  };
  const usaConfig = modelo === "M1" || modelo === "M3" || modelo === "M4";
  const cnpjEf = (l: LinhaLida) => (usaConfig ? (cfgOf(l.numero_dj).cnpj || l.cnpj) : l.cnpj);
  // No M1/M3/M4 o "código" extraído da planilha é o CÓDIGO DO FORNECEDOR (não cliente)
  const codFornecedorEf = (l: LinhaLida) => (usaConfig ? l.codigo_cliente : "");
  const tipoServicoEf = (l: LinhaLida) => (usaConfig ? (cfgOf(l.numero_dj).tipo_servico || l.tipo_servico) : l.tipo_servico);
  const periodoIniEf = (l: LinhaLida) => (usaConfig ? (cfgOf(l.numero_dj).periodo_inicio || l.periodo_inicio || "") : (l.periodo_inicio || ""));
  const periodoFimEf = (l: LinhaLida) => (usaConfig ? (cfgOf(l.numero_dj).periodo_fim || l.periodo_fim || "") : (l.periodo_fim || ""));
  const competenciaEf = (l: LinhaLida) =>
    ((modelo === "M3" || modelo === "M4") ? (cfgOf(l.numero_dj).competencia || l.mes_ref) : l.mes_ref);
  const centroCustoEf = (l: LinhaLida) =>
    ((modelo === "M3" || modelo === "M4") ? (cfgOf(l.numero_dj).centro_custo || l.centro_custo) : l.centro_custo);

  // Resumo agregado
  const clientes = Array.from(new Set(validas.map((l) => l.contratado)));
  const cnpjs = Array.from(new Set(validas.map(cnpjEf).filter(Boolean)));
  const codigosFornecedor = Array.from(new Set(validas.map(codFornecedorEf).filter(Boolean)));
  const contratos = Array.from(new Set(validas.map((l) => l.numero_dj)));
  const tiposServico = Array.from(new Set(validas.map(tipoServicoEf).filter(Boolean)));
  const centrosCusto = Array.from(new Set(validas.map(centroCustoEf).filter(Boolean) as string[]));
  const competencias = Array.from(new Set(validas.map((l) => competenciaEf(l)).filter(Boolean) as string[]));
  const periodosIni = validas.map(periodoIniEf).filter(Boolean) as string[];
  const periodosFim = validas.map(periodoFimEf).filter(Boolean) as string[];
  const periodoIniMin = periodosIni.length ? periodosIni.sort()[0] : "";
  const periodoFimMax = periodosFim.length ? periodosFim.sort().reverse()[0] : "";
  const totalValor = validas.reduce((s, l) => s + l.valor_final, 0);
  const totalValorPlanilha = validas.reduce((s, l) => s + (l.valor_planilha || 0), 0);
  const totalDifCalc = totalValorPlanilha - totalValor;
  const linhasComDivergencia = validas.filter((l) => l.valor_planilha && Math.abs(l.diferenca_calc) > 0.10).length;
  const totalHorasInf = validas.reduce((s, l) => s + l.ht_informado, 0);
  const totalHorasDisp = validas.reduce((s, l) => s + l.horas_disp, 0);
  const totalHorasMec = validas.reduce((s, l) => s + l.horas_mec, 0);
  const totalComplementares = validas.reduce((s, l) => s + l.complementares, 0);
  const totalDesc = validas.reduce((s, l) => s + l.desc_manutencao, 0);
  // Totais específicos do M3
  const totalHtCalc = validas.reduce((s, l) => s + l.ht_calculado, 0);
  const totalHorasPagarBruto = validas.reduce((s, l) => s + l.horas_a_pagar, 0);
  const totalHorasPagarLiquido = validas.reduce((s, l) => s + l.horas_liquidas, 0);

  // Validação: tipo_equip == tipo_servico em todos os itens (provável mapeamento errado)
  const itensComTipoEquip = validas.filter((l) => l.tipo_equip);
  const tipoEquipIgualServico =
    itensComTipoEquip.length > 0 &&
    itensComTipoEquip.every((l) => normalize(l.tipo_equip) === normalize(l.tipo_servico));
  const erroMapeamentoTipoEquip = modelo === "M2" && tipoEquipIgualServico;

  // Validação dos overrides obrigatórios M1/M3
  const m1Pendencias: string[] = [];
  if (modelo === "M1") {
    const djs = Array.from(new Set(validas.map((l) => l.numero_dj)));
    for (const dj of djs) {
      const o = overrides[dj] ?? {};
      if (!o.cliente_id) m1Pendencias.push(`Contrato ${dj}: selecione o Cliente/Contratante`);
      if (!o.tipo_servico) m1Pendencias.push(`Contrato ${dj}: tipo de serviço obrigatório`);
      if (!o.periodo_inicio) m1Pendencias.push(`Contrato ${dj}: período início obrigatório`);
      if (!o.periodo_fim) m1Pendencias.push(`Contrato ${dj}: período fim obrigatório`);
      if (o.periodo_inicio && o.periodo_fim && o.periodo_fim < o.periodo_inicio) {
        m1Pendencias.push(`Contrato ${dj}: período fim não pode ser anterior ao início`);
      }
    }
  }
  const m3Pendencias: string[] = [];
  if (modelo === "M3") {
    const djs = Array.from(new Set(validas.map((l) => l.numero_dj)));
    for (const dj of djs) {
      const s = m3Settings[dj] ?? {};
      if (!s.cliente_id) m3Pendencias.push(`Contrato ${dj}: selecione o Cliente/Contratante`);
      if (!s.competencia) m3Pendencias.push(`Contrato ${dj}: competência obrigatória`);
      if (!s.periodo_inicio) m3Pendencias.push(`Contrato ${dj}: período início obrigatório`);
      if (!s.periodo_fim) m3Pendencias.push(`Contrato ${dj}: período fim obrigatório`);
      if (s.periodo_inicio && s.periodo_fim && s.periodo_fim < s.periodo_inicio) {
        m3Pendencias.push(`Contrato ${dj}: período fim não pode ser anterior ao início`);
      }
      if (!s.centro_custo) m3Pendencias.push(`Contrato ${dj}: centro de custo obrigatório`);
    }
  }

  const m4Pendencias: string[] = [];
  if (modelo === "M4") {
    const djs = Array.from(new Set(validas.map((l) => l.numero_dj)));
    for (const dj of djs) {
      const s = m4Settings[dj] ?? {};
      if (!s.cliente_id) m4Pendencias.push(`Contrato ${dj}: selecione o Cliente/Contratante`);
      if (!s.competencia) m4Pendencias.push(`Contrato ${dj}: competência obrigatória`);
      if (!s.periodo_inicio) m4Pendencias.push(`Contrato ${dj}: período início obrigatório`);
      if (!s.periodo_fim) m4Pendencias.push(`Contrato ${dj}: período fim obrigatório`);
      if (s.periodo_inicio && s.periodo_fim && s.periodo_fim < s.periodo_inicio) {
        m4Pendencias.push(`Contrato ${dj}: período fim não pode ser anterior ao início`);
      }
      if (!s.centro_custo) m4Pendencias.push(`Contrato ${dj}: centro de custo obrigatório`);
      if (!s.fornecedor_nome) m4Pendencias.push(`Contrato ${dj}: fornecedor/locadora obrigatório`);
    }
  }

  const precisaConfirmarDivergencia = (modelo === "M1" || modelo === "M3" || modelo === "M4") && linhasComDivergencia > 0;
  const podeImportar =
    !headerError &&
    validas.length > 0 &&
    !erroMapeamentoTipoEquip &&
    m1Pendencias.length === 0 &&
    m3Pendencias.length === 0 &&
    m4Pendencias.length === 0 &&
    (!precisaConfirmarDivergencia || confirmDivergencia);

  // Helper: chave canônica de medição (contrato + competência + período)
  const buildMedKey = (contratoId: string, competencia: string, ini: string, fim: string) =>
    `${contratoId}|${competencia}|${ini}|${fim}`;

  // Normalização de nome de cliente (sem acentos, sem espaços extras, lowercase)
  const normNome = (s: string) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const normCNPJ = (s: string) => (s || "").replace(/\D/g, "");

  const confirmar = async () => {
    if (!podeImportar) { toast.error("Não é possível importar"); return; }
    setImporting(true);
    try {
      // Etapa 1: preparar caches e resolver cliente/contrato (sem gravar itens ainda)
      // clientesCache: indexado por CNPJ ("cnpj:XXXX") e por nome normalizado ("nome:XXXX")
      const clientesCache = new Map<string, string>();
      // contratosCache: indexado por `${cliente_id}|${numero_dj}|${centro_custo}`
      const contratosCache = new Map<string, { id: string; valor_hora: number; garantia: number }>();
      const equipsCache = new Map<string, string>();
      const contratoEquipCache = new Map<string, string>();

      const [{ data: cli }, { data: ctr }, { data: eqp }] = await Promise.all([
        supabase.from("clientes").select("id, razao_social, cnpj"),
        supabase.from("contratos").select("id, numero_dj, cliente_id, centro_custo, valor_hora_padrao, garantia_minima_horas"),
        supabase.from("equipamentos").select("id, serie, tag"),
      ]);
      cli?.forEach((c: any) => {
        if (c.cnpj) clientesCache.set(`cnpj:${normCNPJ(c.cnpj)}`, c.id);
        if (c.razao_social) clientesCache.set(`nome:${normNome(c.razao_social)}`, c.id);
      });
      ctr?.forEach((c: any) => {
        const k = `${c.cliente_id ?? ""}|${c.numero_dj ?? ""}|${(c.centro_custo ?? "").trim()}`;
        contratosCache.set(k, { id: c.id, valor_hora: Number(c.valor_hora_padrao ?? 0), garantia: Number(c.garantia_minima_horas ?? 0) });
      });
      eqp?.forEach((e: any) => equipsCache.set(`${e.serie ?? ""}|${e.tag ?? ""}`, e.id));

      // Resolver config (M1: overrides, M3: m3Settings, M4: m4Settings) para um único objeto.
      const cfgFor = (dj: string): any =>
        modelo === "M4" ? (m4Settings[dj] ?? {})
        : modelo === "M3" ? (m3Settings[dj] ?? {})
        : (overrides[dj] ?? {});

      // Resolve o cliente_id de uma linha SEM criar (apenas lookup) — usado para detectar conflito.
      // Para M1/M3 usa o cliente_id da config; para M2 usa CNPJ → nome.
      const resolveClienteIdLookup = (l: LinhaLida): string | null => {
        const cfg = cfgFor(l.numero_dj);
        if (modelo === "M1" || modelo === "M3" || modelo === "M4") return cfg.cliente_id || null;
        const cnpj = normCNPJ(cfg.cnpj || l.cnpj);
        if (cnpj) {
          const id = clientesCache.get(`cnpj:${cnpj}`);
          if (id) return id;
        }
        const nome = normNome(l.contratado);
        if (nome) {
          const id = clientesCache.get(`nome:${nome}`);
          if (id) return id;
        }
        return null;
      };

      // Calcular períodos por medKey provisória (numero_dj+mes_ref) para checar conflitos
      const periodoPorMedicao = new Map<string, { inicio: string; fim: string }>();
      for (const l of validas) {
        const ov = cfgFor(l.numero_dj);
        const periodoIniEfetivo = ov.periodo_inicio || l.periodo_inicio || null;
        const periodoFimEfetivo = ov.periodo_fim || l.periodo_fim || null;
        const provKey = `${l.numero_dj}|${l.mes_ref}`;
        if (!periodoPorMedicao.has(provKey)) {
          const mesmas = validas.filter((x) => x.numero_dj === l.numero_dj && x.mes_ref === l.mes_ref);
          const inicios = mesmas.map((x) => x.periodo_inicio).filter(Boolean).sort() as string[];
          const fins = mesmas.map((x) => x.periodo_fim).filter(Boolean).sort() as string[];
          periodoPorMedicao.set(provKey, {
            inicio: periodoIniEfetivo ?? inicios[0] ?? l.mes_ref!,
            fim: periodoFimEfetivo ?? fins[fins.length - 1] ?? lastDayOfMonth(l.mes_ref!),
          });
        }
      }


      // Verificar conflitos somente quando contrato JÁ existe para o MESMO cliente+centro de custo
      const conflitosDetectados: ConflitoMedicao[] = [];
      const valorPorChave = new Map<string, number>();
      const ctrInfoPorLinha = new Map<string, { id: string } | null>();
      for (const l of validas) {
        const provKey = `${l.numero_dj}|${l.mes_ref}`;
        const periodo = periodoPorMedicao.get(provKey)!;
        const cfg = cfgFor(l.numero_dj);
        const clienteIdLookup = resolveClienteIdLookup(l);
        const cc = (((modelo === "M3" || modelo === "M4") ? cfg.centro_custo : null) || l.centro_custo || "").trim();
        const ctrKey = clienteIdLookup ? `${clienteIdLookup}|${l.numero_dj}|${cc}` : "";
        const ctrInfo = ctrKey ? contratosCache.get(ctrKey) : undefined;
        ctrInfoPorLinha.set(provKey, ctrInfo ? { id: ctrInfo.id } : null);
        if (!ctrInfo) continue;
        const chave = buildMedKey(ctrInfo.id, l.mes_ref!, periodo.inicio, periodo.fim);
        valorPorChave.set(chave, (valorPorChave.get(chave) ?? 0) + l.valor_final);
      }

      const provKeysCheck = new Set<string>();
      for (const l of validas) {
        const provKey = `${l.numero_dj}|${l.mes_ref}`;
        const ctrInfo = ctrInfoPorLinha.get(provKey);
        if (!ctrInfo) continue;
        if (provKeysCheck.has(provKey)) continue;
        provKeysCheck.add(provKey);
        const periodo = periodoPorMedicao.get(provKey)!;
        const chave = buildMedKey(ctrInfo.id, l.mes_ref!, periodo.inicio, periodo.fim);

        // Considera a versão mais recente (ativa ou cancelada/inativa)
        const { data: existentes } = await supabase
          .from("medicoes")
          .select("id, status, valor_final, versao, ativa, updated_at, created_by, arquivo_origem, contratos(numero_dj, centro_custo, clientes(razao_social, cnpj))")
          .eq("contrato_id", ctrInfo.id)
          .eq("competencia", l.mes_ref!)
          .eq("periodo_inicio", periodo.inicio)
          .eq("periodo_fim", periodo.fim)
          .order("versao", { ascending: false })
          .limit(1);

        const ex = existentes?.[0] as any;
        if (!ex) continue;

        // buscar último registro de histórico (email + motivo cancelamento)
        let userEmail: string | null = null;
        let motivoCancelamento: string | null = null;
        const { data: hist } = await supabase
          .from("medicao_status_historico")
          .select("user_email, status_novo, motivo, created_at")
          .eq("medicao_id", ex.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (hist?.length) {
          userEmail = hist[0].user_email ?? null;
          const cancel = hist.find((h: any) => h.status_novo === "cancelada");
          if (cancel) {
            userEmail = cancel.user_email ?? userEmail;
            motivoCancelamento = cancel.motivo ?? null;
          }
        }

        conflitosDetectados.push({
          chave,
          cliente: ex.contratos?.clientes?.razao_social ?? "—",
          clienteCnpj: ex.contratos?.clientes?.cnpj ?? null,
          contratoNumero: ex.contratos?.numero_dj ?? l.numero_dj,
          centroCusto: ex.contratos?.centro_custo ?? null,
          competencia: l.mes_ref!,
          periodoInicio: periodo.inicio,
          periodoFim: periodo.fim,
          medicaoExistente: {
            id: ex.id,
            status: ex.status as string,
            valor_final: Number(ex.valor_final ?? 0),
            versao: Number(ex.versao ?? 1),
            updated_at: ex.updated_at,
            user_email: userEmail,
            motivo_cancelamento: motivoCancelamento,
            arquivo_origem: ex.arquivo_origem ?? null,
          },
          valorNovo: valorPorChave.get(chave) ?? 0,
          arquivoNovo: filename || null,
        });
      }

      if (conflitosDetectados.length > 0) {
        // Pausar e abrir diálogo. Persistir contexto para retomar depois.
        setConflitos(conflitosDetectados);
        setPendingCtx({ clientesCache, contratosCache, equipsCache, contratoEquipCache, periodoPorMedicao });
        setConflitoOpen(true);
        setImporting(false);
        return;
      }

      // Sem conflitos → executa direto
      await executarImportacao(
        { clientesCache, contratosCache, equipsCache, contratoEquipCache, periodoPorMedicao },
        new Map(),
        new Set(),
      );
    } catch (e: any) {
      toast.error("Erro: " + e.message);
      setImporting(false);
    }
  };

  const onResolveConflitos = async (resolucoes: ConflitoResolucao[]) => {
    if (!pendingCtx) return;
    setConflitoOpen(false);
    setImporting(true);
    try {
      const medicaoIdsResolvidos = new Map<string, string>();
      const skipChaves = new Set<string>();

      for (const r of resolucoes) {
        const conflito = conflitos.find((c) => c.chave === r.chave)!;
        if (r.decisao === "cancelar") {
          skipChaves.add(r.chave);
          continue;
        }
        if (r.decisao === "reabrir") {
          const { error } = await supabase.rpc("reabrir_medicao_cancelada" as any, {
            _medicao_id: conflito.medicaoExistente.id,
            _motivo: r.motivo,
          });
          if (error) throw new Error(`Reabrir medição ${conflito.contratoNumero}: ${error.message}`);
          // Limpa itens e usa a medição reaberta
          await supabase.from("medicao_itens").delete().eq("medicao_id", conflito.medicaoExistente.id);
          medicaoIdsResolvidos.set(r.chave, conflito.medicaoExistente.id);
        } else if (r.decisao === "nova_versao") {
          const { data, error } = await supabase.rpc("criar_nova_versao_medicao" as any, {
            _medicao_anterior_id: conflito.medicaoExistente.id,
            _motivo: r.motivo,
            _arquivo_origem: r.arquivoOrigem ?? filename ?? null,
            _origem: "reimportacao",
          });
          if (error) throw new Error(`Nova versão ${conflito.contratoNumero}: ${error.message}`);
          medicaoIdsResolvidos.set(r.chave, data as unknown as string);
        }
      }

      await executarImportacao(pendingCtx, medicaoIdsResolvidos, skipChaves);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
      setImporting(false);
    } finally {
      setPendingCtx(null);
      setConflitos([]);
    }
  };

  const onCancelConflitos = () => {
    setConflitoOpen(false);
    setConflitos([]);
    setPendingCtx(null);
    setImporting(false);
    toast.info("Importação cancelada pelo usuário.");
  };

  const executarImportacao = async (
    ctx: any,
    medicaoIdsResolvidos: Map<string, string>,
    skipChaves: Set<string>,
  ) => {
    const { clientesCache, contratosCache, equipsCache, contratoEquipCache, periodoPorMedicao } = ctx;
    try {
      const medicoesCache = new Map<string, string>();
      let createdCli = 0, createdCtr = 0, createdEqp = 0, createdMed = 0, createdItens = 0;
      let skippedItens = 0;

      for (const l of validas) {
        const isM1 = modelo === "M1";
        const isM3 = modelo === "M3";
        const isM4 = modelo === "M4";
        const isApiaLike = isM3 || isM4;
        const cfg: any = isM4
          ? (m4Settings[l.numero_dj] ?? {})
          : isM3 ? (m3Settings[l.numero_dj] ?? {}) : (overrides[l.numero_dj] ?? {});
        const cnpjEfetivo = (cfg.cnpj || l.cnpj || "").trim();
        const tipoServicoEfetivo = (cfg.tipo_servico || l.tipo_servico || "Locação").trim();
        const periodoIniEfetivo = cfg.periodo_inicio || l.periodo_inicio || null;
        const periodoFimEfetivo = cfg.periodo_fim || l.periodo_fim || null;
        const centroCustoEfetivo = (isApiaLike ? (cfg.centro_custo || l.centro_custo) : l.centro_custo) || null;

        const fornecedorNome = isM1
          ? l.contratado
          : (isApiaLike ? (cfg.fornecedor_nome || l.contratado) : "MC TERRAPLENAGEM E CONSTRUÇÕES LTDA");
        const fornecedorCodigo = isM1
          ? l.codigo_cliente
          : (isApiaLike ? (cfg.fornecedor_codigo || l.codigo_cliente) : "15811");
        const fornecedorCnpj = isM1 ? cnpjEfetivo : (isApiaLike ? "" : "07.299.287/0001-41");

        let clienteId: string | undefined;
        if (isM1 || isApiaLike) {
          clienteId = cfg.cliente_id;
          if (!clienteId) throw new Error(`Selecione o Cliente/Contratante para o contrato ${l.numero_dj}`);
        } else {
          // M2: identificar prioritariamente por CNPJ; depois por nome normalizado
          const cnpjN = normCNPJ(cnpjEfetivo);
          const nomeN = normNome(l.contratado);
          if (cnpjN) clienteId = clientesCache.get(`cnpj:${cnpjN}`);
          if (!clienteId && nomeN) clienteId = clientesCache.get(`nome:${nomeN}`);
          if (!clienteId) {
            const { data, error } = await supabase.from("clientes").insert({
              razao_social: l.contratado,
              cnpj: cnpjEfetivo || null,
              codigo_cliente: l.codigo_cliente || null,
              status: "ativo",
            } as any).select("id").single();
            if (error) throw error;
            clienteId = data.id;
            if (cnpjN) clientesCache.set(`cnpj:${cnpjN}`, clienteId!);
            if (nomeN) clientesCache.set(`nome:${nomeN}`, clienteId!);
            createdCli++;
          }
        }

        // Chave do contrato: cliente_id + numero_dj + centro_custo (mesmo nº pode existir para clientes diferentes)
        const ctrCacheKey = `${clienteId}|${l.numero_dj}|${(centroCustoEfetivo ?? "").trim()}`;
        let contrato = contratosCache.get(ctrCacheKey);
        if (!contrato) {
          // Procura no banco por (cliente_id, numero_dj, centro_custo)
          const { data: existCtr } = await supabase.from("contratos")
            .select("id, valor_hora_padrao, garantia_minima_horas")
            .eq("cliente_id", clienteId!)
            .eq("numero_dj", l.numero_dj)
            .eq("centro_custo", centroCustoEfetivo ?? "")
            .maybeSingle();
          if (existCtr) {
            contrato = { id: existCtr.id, valor_hora: Number(existCtr.valor_hora_padrao ?? 0), garantia: Number(existCtr.garantia_minima_horas ?? 0) };
          } else {
            const inicio = l.inicio_op ?? periodoIniEfetivo ?? (l.mes_ref ?? new Date().toISOString().slice(0, 10));
            const termino = l.termino_contrato ?? new Date(new Date(inicio).getFullYear() + 1, 11, 31).toISOString().slice(0, 10);
            const { data, error } = await supabase.from("contratos").insert({
              numero_dj: l.numero_dj, cliente_id: clienteId,
              tipo_servico: tipoServicoEfetivo,
              centro_custo: centroCustoEfetivo,
              inicio_operacao: inicio, termino_contrato: termino,
              valor_hora_padrao: l.valor_hora, garantia_minima_horas: l.garantia,
              status: "ativo",
              fornecedor_nome: fornecedorNome || null,
              fornecedor_codigo: fornecedorCodigo || null,
              fornecedor_cnpj: fornecedorCnpj || null,
            } as any).select("id, valor_hora_padrao, garantia_minima_horas").single();
            if (error) throw error;
            contrato = { id: data.id, valor_hora: Number(data.valor_hora_padrao ?? 0), garantia: Number(data.garantia_minima_horas ?? 0) };
            createdCtr++;
          }
          contratosCache.set(ctrCacheKey, contrato);
        } else {
          const patch: any = { tipo_servico: tipoServicoEfetivo || undefined };
          if (isM1 || isApiaLike) patch.cliente_id = clienteId;
          if (isM4 && cfg.local_servico) patch.local_servico = cfg.local_servico;
          if (fornecedorNome) patch.fornecedor_nome = fornecedorNome;
          if (fornecedorCodigo) patch.fornecedor_codigo = fornecedorCodigo;
          if (fornecedorCnpj) patch.fornecedor_cnpj = fornecedorCnpj;
          await supabase.from("contratos").update(patch).eq("id", contrato.id);
        }

        const eqpKey = `${l.serie}|${l.tag}`;
        let equipId = equipsCache.get(eqpKey);
        if (!equipId) {
          const { data, error } = await supabase.from("equipamentos").insert({
            tag: l.tag, serie: l.serie, modelo: l.modelo || "—", tipo: l.tipo_equip || "—", status: "ativo",
          } as any).select("id").single();
          if (error) throw error;
          equipId = data.id; equipsCache.set(eqpKey, equipId); createdEqp++;
        } else {
          await supabase.from("equipamentos").update({
            tag: l.tag, serie: l.serie, modelo: l.modelo || "—", tipo: l.tipo_equip || "—",
          } as any).eq("id", equipId);
        }

        const ceKey = `${contrato.id}|${equipId}`;
        let ceId = contratoEquipCache.get(ceKey);
        if (!ceId) {
          const { data: existing } = await supabase.from("contrato_equipamentos")
            .select("id").eq("contrato_id", contrato.id).eq("equipamento_id", equipId).maybeSingle();
          if (existing) { ceId = existing.id; }
          else {
            const { data, error } = await supabase.from("contrato_equipamentos").insert({
              contrato_id: contrato.id, equipamento_id: equipId,
              data_inicio: l.inicio_op ?? l.mes_ref!, horimetro_inicial: l.hor_inicial,
              valor_hora_override: l.valor_hora || null, ativo: true,
            } as any).select("id").single();
            if (error) throw error;
            ceId = data.id;
          }
          contratoEquipCache.set(ceKey, ceId);
        }

        const provKey = `${l.numero_dj}|${l.mes_ref}`;
        const periodo = periodoPorMedicao.get(provKey)!;
        const periodoIniMed = periodo.inicio;
        const periodoFimMed = periodo.fim;
        const chaveCanonica = buildMedKey(contrato.id, l.mes_ref!, periodoIniMed, periodoFimMed);

        // Pular linhas cuja chave foi marcada como "cancelar importação"
        if (skipChaves.has(chaveCanonica)) {
          skippedItens++;
          continue;
        }

        let medicaoId = medicoesCache.get(chaveCanonica);
        if (!medicaoId) {
          const resolvido = medicaoIdsResolvidos.get(chaveCanonica);
          if (resolvido) {
            medicaoId = resolvido;
            await supabase.from("medicoes").update({
              periodo_inicio: periodoIniMed, periodo_fim: periodoFimMed,
              observacoes: `Importado de ${filename}`,
            } as any).eq("id", medicaoId);
          } else {
            // Sem conflito → pode existir uma medição ATIVA não-cancelada (caso raro: criada entre etapas).
            // Garantir que NUNCA atualizamos uma cancelada silenciosamente.
            const { data: existing } = await supabase.from("medicoes")
              .select("id, status, ativa")
              .eq("contrato_id", contrato.id)
              .eq("competencia", l.mes_ref!)
              .eq("periodo_inicio", periodoIniMed)
              .eq("periodo_fim", periodoFimMed)
              .eq("ativa", true)
              .maybeSingle();

            if (existing) {
              if (existing.status === "cancelada") {
                throw new Error(
                  `Medição ${l.numero_dj} (${l.mes_ref}) está cancelada. Reabra-a ou crie uma nova versão antes de importar.`,
                );
              }
              if (existing.status !== "rascunho") {
                throw new Error(
                  `Medição ${l.numero_dj} (${l.mes_ref}) está em status ${existing.status} e não pode ser substituída diretamente.`,
                );
              }
              medicaoId = existing.id;
              await supabase.from("medicao_itens").delete().eq("medicao_id", medicaoId);
              await supabase.from("medicoes").update({
                periodo_inicio: periodoIniMed, periodo_fim: periodoFimMed,
              } as any).eq("id", medicaoId);
            } else {
              const { data, error } = await supabase.from("medicoes").insert({
                contrato_id: contrato.id, competencia: l.mes_ref!,
                periodo_inicio: periodoIniMed, periodo_fim: periodoFimMed,
                status: "rascunho",
                observacoes: `Importado de ${filename}`,
                versao: 1,
                ativa: true,
              } as any).select("id").single();
              if (error) throw error;
              medicaoId = data.id; createdMed++;
            }
          }
          medicoesCache.set(chaveCanonica, medicaoId);
        }

        const calc = calcularItem({
          horas_informadas: l.ht_informado,
          horas_mecanicas: l.horas_mec,
          horas_paradas: 0,
          horas_chuvoso: 0,
          horas_excecao_chuvoso: l.excecao_chuvoso,
          valor_hora_override: l.valor_hora,
          complementares_extra: l.complementares,
        }, [], l.mes_ref!, l.valor_hora, l.garantia);

        const valor_final_real = calc.valor_final - l.desc_manutencao;

        // M3: marca o item com metadados da planilha para PDF/memória de cálculo específicos
        const regrasFinal: any[] = Array.isArray(calc.regras_aplicadas) ? [...calc.regras_aplicadas] : [];
        if (isM3) {
          const tp = String((l as any).tipo_pagamento ?? "").toUpperCase().replace(/\s+/g, "");
          const tipoPagamentoNorm = tp.includes("HG") ? "H.G." : tp.includes("HT") ? "H.T." : (l as any).tipo_pagamento || "";
          regrasFinal.push({
            tipo: "m3_importacao",
            origem: "importacao",
            descricao: "Valores calculados pela planilha M3 (Controle de Horímetros Obras Ápia)",
            tipo_pagamento: tipoPagamentoNorm,
            garantia_aplicada: Number(l.garantia ?? 0),
            ht_informado: Number(l.ht_informado ?? 0),
            horas_mecanicas: Number(l.horas_mec ?? 0),
            horas_pagar_bruto: Number((l as any).horas_a_pagar ?? calc.horas_a_pagar ?? 0),
            horas_pagar_liquido: Number((l as any).horas_liquidas ?? calc.horas_liquidas ?? 0),
            valor_hora: Number(l.valor_hora ?? 0),
            valor_final_planilha: Number((l as any).valor_final ?? 0),
          });
        }

        const { error: errIt } = await supabase.from("medicao_itens").insert({
          medicao_id: medicaoId, equipamento_id: equipId, contrato_equipamento_id: ceId,
          periodo_inicio: l.periodo_inicio ?? periodoIniMed, periodo_fim: l.periodo_fim ?? periodoFimMed,
          horimetro_inicial: l.hor_inicial, horimetro_final: l.hor_final,
          horas_informadas: l.ht_informado,
          horas_mecanicas: l.horas_mec,
          horas_paradas: l.horas_disp,
          horas_chuvoso: 0,
          horas_excecao_chuvoso: l.excecao_chuvoso,
          horas_descontaveis: calc.horas_descontaveis,
          horas_liquidas: calc.horas_liquidas,
          garantia_minima: l.garantia,
          horas_a_pagar: calc.horas_a_pagar,
          valor_hora: l.valor_hora,
          valor_bruto: calc.valor_bruto,
          valor_complementares: l.complementares,
          valor_descontos: l.desc_manutencao,
          valor_final: valor_final_real,
          regras_aplicadas: regrasFinal as any,
          memoria_calculo: calc.memoria_calculo as any,
          observacoes: l.observacoes || null,
        } as any);
        if (errIt) throw errIt;
        createdItens++;
      }

      for (const medicaoId of medicoesCache.values()) {
        const { data: itens } = await supabase.from("medicao_itens")
          .select("horas_informadas, horas_liquidas, horas_a_pagar, valor_bruto, valor_complementares, valor_descontos, valor_final")
          .eq("medicao_id", medicaoId);
        const t = (itens ?? []).reduce((a, i: any) => ({
          hi: a.hi + Number(i.horas_informadas), hl: a.hl + Number(i.horas_liquidas), hp: a.hp + Number(i.horas_a_pagar),
          vb: a.vb + Number(i.valor_bruto), vc: a.vc + Number(i.valor_complementares),
          vd: a.vd + Number(i.valor_descontos), vf: a.vf + Number(i.valor_final),
        }), { hi: 0, hl: 0, hp: 0, vb: 0, vc: 0, vd: 0, vf: 0 });
        await supabase.from("medicoes").update({
          total_horas_informadas: t.hi, total_horas_liquidas: t.hl, total_horas_pagar: t.hp,
          valor_bruto: t.vb, valor_complementares: t.vc, valor_descontos: t.vd, valor_final: t.vf,
        } as any).eq("id", medicaoId);
      }

      const skipMsg = skippedItens > 0 ? ` (${skippedItens} linha(s) puladas por escolha do usuário)` : "";
      toast.success(`Importação concluída: ${createdItens} itens em ${medicoesCache.size} medição(ões)${skipMsg}. ${createdCli} clientes, ${createdCtr} contratos, ${createdEqp} equipamentos novos.`);
      navigate("/medicoes");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally { setImporting(false); }
  };


  return (
    <div>
      <PageHeader
        title="Importar planilha de medição"
        description='Suporta os layouts M1 "BASE DE DADOS", M2 "Template Medição" e M3 "Controle de Horímetros Obras Ápia"'
        actions={<Button variant="outline" onClick={() => navigate("/medicoes")}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>}
      />

      <Card className="mb-4"><CardContent className="p-4">
        <Label>Arquivo Excel (.xlsx) *</Label>
        <Input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <p className="mt-2 text-xs text-muted-foreground">
          Identificação automática: aba <strong>"BASE DE DADOS"</strong> = M1, aba <strong>"Template Medição"</strong> = M2, aba começando com <strong>"Obra"</strong> + cabeçalhos compatíveis = M3 (Obras Ápia).
        </p>
      </CardContent></Card>

      {headerError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{headerError}</AlertDescription>
        </Alert>
      )}

      {modelo && headerInfo && headerInfo.rowIndex >= 0 && !headerError && (
        <Alert className="mb-4">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Modelo {modelo}</strong> detectado{sheetUsed ? ` (aba "${sheetUsed}")` : ""}. Cabeçalho na linha {headerInfo.rowIndex + 1}. {Object.keys(headerInfo.colMap).length} colunas mapeadas.
          </AlertDescription>
        </Alert>
      )}

      {erroMapeamentoTipoEquip && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Erro de mapeamento:</strong> Tipo Equipamento está sendo preenchido com Tipo Serviço.
            A importação foi bloqueada; revise a aba "Template Medição" e confirme que a coluna H contém o Tipo Equip.
          </AlertDescription>
        </Alert>
      )}

      {(linhas.length > 0 || ignoradas.length > 0) && (
        <>
          <Card className="mb-4"><CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Resumo da pré-visualização</h3>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              <Stat label="Modelo identificado" value={modelo ?? "—"} />
              <Stat label="Linhas lidas" value={String(linhas.length + ignoradas.length)} />
              <Stat label="Linhas válidas" value={String(validas.length)} />
              <Stat label="Linhas ignoradas" value={String(ignoradas.length)} />
              <Stat label="Com erro" value={String(linhas.length - validas.length)} />
              {modelo === "M1" ? (
                <>
                  <Stat label="Fornecedor / Locadora" value={clientes.length === 1 ? clientes[0] : String(clientes.length)} />
                  <Stat label="Código fornecedor" value={codigosFornecedor.length === 1 ? codigosFornecedor[0] : (codigosFornecedor.length ? `${codigosFornecedor.length}` : "—")} />
                </>
              ) : (modelo === "M3" || modelo === "M4") ? (
                <>
                  {(() => {
                    const src = modelo === "M4" ? m4Settings : m3Settings;
                    const cliIds = Array.from(new Set(Object.values(src).map((s: any) => s?.cliente_id).filter(Boolean) as string[]));
                    const cliNomes = cliIds.map((id) => clientesAtivos.find((c) => c.id === id)?.razao_social).filter(Boolean) as string[];
                    const fornNomes = Array.from(new Set(Object.values(src).map((s: any) => s?.fornecedor_nome).filter(Boolean) as string[]));
                    const fornCods = Array.from(new Set(Object.values(src).map((s: any) => s?.fornecedor_codigo).filter(Boolean) as string[]));
                    return (
                      <>
                        <Stat label="Cliente / Contratante" value={cliNomes.length === 1 ? cliNomes[0] : (cliNomes.length ? `${cliNomes.length}` : "— (selecione)")} />
                        <Stat label="Fornecedor / Locadora" value={fornNomes.length === 1 ? fornNomes[0] : (fornNomes.length ? `${fornNomes.length}` : (clientes[0] ?? "—"))} />
                        <Stat label="Código fornecedor" value={fornCods.length === 1 ? fornCods[0] : (fornCods.length ? `${fornCods.length}` : "—")} />
                      </>
                    );
                  })()}
                </>
              ) : (
                <>
                  <Stat label="Cliente(s)" value={clientes.length === 1 ? clientes[0] : String(clientes.length)} />
                  <Stat label="CNPJ" value={cnpjs.length === 1 ? cnpjs[0] : (cnpjs.length ? `${cnpjs.length}` : "—")} />
                </>
              )}
              <Stat label="Contrato / Nº DJ" value={contratos.length === 1 ? contratos[0] : String(contratos.length)} />
              <Stat label="Tipo de serviço" value={tiposServico.length === 1 ? tiposServico[0] : (tiposServico.length ? `${tiposServico.length}` : "—")} />
              <Stat label="Centro de custo" value={centrosCusto.length === 1 ? centrosCusto[0] : (centrosCusto.length ? `${centrosCusto.length}` : "—")} />
              <Stat label="Competência(s)" value={competencias.map((c) => fmtCompetencia(c)).join(", ") || "—"} />
              <Stat label="Período início" value={periodoIniMin ? fmtDate(periodoIniMin) : "—"} />
              <Stat label="Período fim" value={periodoFimMax ? fmtDate(periodoFimMax) : "—"} />
              <Stat label="Equipamentos válidos" value={String(validas.length)} />
              <Stat label="Total HT informado" value={fmtNum(totalHorasInf)} />
              {modelo === "M1" && <Stat label="Total horas à disposição" value={fmtNum(totalHorasDisp)} />}
              <Stat label="Total horas mecânicas" value={fmtNum(totalHorasMec)} />
              <Stat label="Total complementares" value={fmtBRL(totalComplementares)} />
              <Stat label="Total descontos" value={fmtBRL(totalDesc)} />
              <Stat label="Valor total previsto" value={fmtBRL(totalValor)} highlight />
              {modelo === "M1" && totalValorPlanilha > 0 && (
                <>
                  <Stat label="Total medição (planilha)" value={fmtBRL(totalValorPlanilha)} />
                  <Stat label="Total recalculado" value={fmtBRL(totalValor)} />
                  <Stat label="Diferença total" value={fmtBRL(totalDifCalc)} highlight={Math.abs(totalDifCalc) > 0.10} />
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="default"><CheckCircle2 className="mr-1 h-3 w-3" />{validas.length} válidas</Badge>
              {linhas.length - validas.length > 0 && <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />{linhas.length - validas.length} com erro</Badge>}
              {ignoradas.length > 0 && <Badge variant="secondary">{ignoradas.length} ignoradas</Badge>}
              {linhasComDivergencia > 0 && <Badge variant="destructive">{linhasComDivergencia} com divergência de cálculo</Badge>}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => { setLinhas([]); setIgnoradas([]); setFilename(""); setHeaderInfo(null); setHeaderError(""); setOverrides({}); setM3Settings({}); setM3Result(null); setM4Settings({}); setM4Result(null); setModelo(null); setConfirmDivergencia(false); }}>Cancelar</Button>
                <Button onClick={confirmar} disabled={importing || !podeImportar}>
                  {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                  Confirmar importação ({validas.length})
                </Button>
              </div>
            </div>
            {m1Pendencias.length > 0 && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Preencha os campos obrigatórios antes de confirmar:</strong>
                  <ul className="mt-1 ml-4 list-disc">
                    {m1Pendencias.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {m4Pendencias.length > 0 && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Preencha os campos obrigatórios do Modelo M4 antes de confirmar:</strong>
                  <ul className="mt-1 ml-4 list-disc">
                    {m4Pendencias.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            {m3Pendencias.length > 0 && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Preencha os campos obrigatórios do Modelo M3 antes de confirmar:</strong>
                  <ul className="mt-1 ml-4 list-disc">
                    {m3Pendencias.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {precisaConfirmarDivergencia && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <div className="mb-2">
                    Existem <strong>{linhasComDivergencia}</strong> linha(s) com divergência maior que R$ 0,10 entre o valor da planilha e o valor recalculado pelo sistema. A importação não está bloqueada, mas requer confirmação.
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={confirmDivergencia} onChange={(e) => setConfirmDivergencia(e.target.checked)} />
                    <span>Estou ciente das divergências e desejo prosseguir.</span>
                  </label>
                </AlertDescription>
              </Alert>
            )}
            {ignoradas.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                <strong>Atenção:</strong> Revise as linhas ignoradas ({ignoradas.length}) antes de confirmar a importação.
              </p>
            )}
          </CardContent></Card>

          {modelo === "M1" && validas.length > 0 && (
            <Card className="mb-4"><CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold">
                Campos obrigatórios por contrato (Modelo M1)
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Estes campos podem não existir na planilha "BASE DE DADOS". Preencha antes de confirmar.
                A competência continua sendo {competencias.map((c) => fmtCompetencia(c)).join(", ")}, mas o período real da medição será salvo separadamente.
              </p>
              <div className="space-y-4">
                {Array.from(new Set(validas.map((l) => l.numero_dj))).map((dj) => {
                  const ov = overrides[dj] ?? {};
                  const setOv = (patch: Partial<typeof ov>) =>
                    setOverrides((prev) => ({ ...prev, [dj]: { ...(prev[dj] ?? {}), ...patch } }));
                  const linhaRef = validas.find((l) => l.numero_dj === dj)!;
                  return (
                    <div key={dj} className="rounded-md border p-3">
                      <div className="mb-2 text-xs">
                        <span className="font-medium">Contrato <span className="font-mono">{dj}</span></span>
                        <span className="ml-2 text-muted-foreground">
                          Fornecedor/Locadora: <span className="font-medium text-foreground">{linhaRef.contratado}</span>
                          {linhaRef.codigo_cliente && <> · cód. <span className="font-mono">{linhaRef.codigo_cliente}</span></>}
                        </span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                        <div className="lg:col-span-2">
                          <Label className="text-xs">Cliente / Contratante *</Label>
                          <Select value={ov.cliente_id ?? ""} onValueChange={(v) => setOv({ cliente_id: v })}>
                            <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                            <SelectContent>
                              {clientesAtivos.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">CNPJ do fornecedor</Label>
                          <Input value={ov.cnpj ?? ""} onChange={(e) => setOv({ cnpj: e.target.value })} placeholder="opcional" />
                        </div>
                        <div>
                          <Label className="text-xs">Tipo de serviço *</Label>
                          <Select value={ov.tipo_servico ?? ""} onValueChange={(v) => setOv({ tipo_servico: v })}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              {TIPOS_SERVICO_M1.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Período início *</Label>
                          <Input type="date" value={ov.periodo_inicio ?? ""} onChange={(e) => setOv({ periodo_inicio: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Período fim *</Label>
                          <Input type="date" value={ov.periodo_fim ?? ""} onChange={(e) => setOv({ periodo_fim: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent></Card>
          )}

          {modelo === "M3" && validas.length > 0 && (
            <Card className="mb-4"><CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold">
                Configurações do Modelo M3 — Obras Ápia (aba "{sheetUsed}")
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Confirme cliente/contratante, fornecedor, centro de custo, competência e período antes de importar.
                Sugestões automáticas: cliente <strong>Construtora Ápia</strong>, período <strong>dia 16 do mês anterior até dia 15 do mês da competência</strong>.
              </p>
              <div className="space-y-4">
                {Array.from(new Set(validas.map((l) => l.numero_dj))).map((dj) => {
                  const s = m3Settings[dj] ?? {};
                  const setS = (patch: Partial<typeof s>) => {
                    setM3Settings((prev) => {
                      const next = { ...prev, [dj]: { ...(prev[dj] ?? {}), ...patch } };
                      // Reflete competência/centro custo nas linhas convertidas (mes_ref e centro_custo)
                      if ("competencia" in patch || "centro_custo" in patch) {
                        const novaComp = next[dj]?.competencia;
                        const novoCC = next[dj]?.centro_custo;
                        setLinhas((linhasPrev) => linhasPrev.map((l) => l.numero_dj === dj ? {
                          ...l,
                          mes_ref: novaComp || l.mes_ref,
                          centro_custo: novoCC || l.centro_custo,
                        } : l));
                      }
                      return next;
                    });
                  };
                  return (
                    <div key={dj} className="rounded-md border p-3">
                      <div className="mb-2 text-xs">
                        <span className="font-medium">Contrato/Nº DJ <span className="font-mono">{dj}</span></span>
                        <span className="ml-2 text-muted-foreground">
                          Fornecedor: <span className="font-medium text-foreground">{s.fornecedor_nome || "—"}</span>
                          {s.fornecedor_codigo && <> · cód. <span className="font-mono">{s.fornecedor_codigo}</span></>}
                        </span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                          <Label className="text-xs">Cliente / Contratante *</Label>
                          <Select value={s.cliente_id ?? ""} onValueChange={(v) => setS({ cliente_id: v })}>
                            <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                            <SelectContent>
                              {clientesAtivos.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Centro de custo *</Label>
                          <Input value={s.centro_custo ?? ""} onChange={(e) => setS({ centro_custo: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Competência *</Label>
                          <Input type="month" value={(s.competencia ?? "").slice(0, 7)} onChange={(e) => setS({ competencia: e.target.value ? `${e.target.value}-01` : "" })} />
                        </div>
                        <div>
                          <Label className="text-xs">Período início *</Label>
                          <Input type="date" value={s.periodo_inicio ?? ""} onChange={(e) => setS({ periodo_inicio: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Período fim *</Label>
                          <Input type="date" value={s.periodo_fim ?? ""} onChange={(e) => setS({ periodo_fim: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Fornecedor / Locadora</Label>
                          <Input value={s.fornecedor_nome ?? ""} onChange={(e) => setS({ fornecedor_nome: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Código do fornecedor</Label>
                          <Input value={s.fornecedor_codigo ?? ""} onChange={(e) => setS({ fornecedor_codigo: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Tipo de serviço</Label>
                          <Select value={s.tipo_servico ?? ""} onValueChange={(v) => setS({ tipo_servico: v })}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              {TIPOS_SERVICO_M1.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3 text-xs">
                <Stat label="Total HT calculado" value={fmtNum(totalHtCalc)} />
                <Stat label="Total horas pagar bruto" value={fmtNum(totalHorasPagarBruto)} />
                <Stat label="Total horas pagar líquido" value={fmtNum(totalHorasPagarLiquido)} />
              </div>
            </CardContent></Card>
          )}

          {validas.length > 0 && (modelo === "M1" || modelo === "M3") && (
            <Card className="mb-4"><CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold">
                Amostra do mapeamento — Modelo {modelo} (aba "{sheetUsed}") — primeiras 5 linhas válidas
              </h3>
              <div className="overflow-x-auto border rounded-md">
                <Table className="min-w-max text-xs">
                  <TableHeader><TableRow>
                    <TableHead className="whitespace-nowrap">Mês Referência</TableHead>
                    <TableHead className="whitespace-nowrap">Nº DJ</TableHead>
                    <TableHead className="whitespace-nowrap">Contratado</TableHead>
                    <TableHead className="whitespace-nowrap">Código cliente</TableHead>
                    <TableHead className="whitespace-nowrap">Tipo Equipamento</TableHead>
                    <TableHead className="whitespace-nowrap">Modelo</TableHead>
                    <TableHead className="whitespace-nowrap">Série</TableHead>
                    <TableHead className="whitespace-nowrap">Tag</TableHead>
                    <TableHead className="whitespace-nowrap">Centro Custo</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Horímetro Inicial</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Horímetro Final</TableHead>
                    <TableHead className="text-right whitespace-nowrap">HT Calculado</TableHead>
                    <TableHead className="text-right whitespace-nowrap">HT Informado</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Garantia Contratual</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Garantia Real</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Horas Disposição</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Horas Mecânicas</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Horas a Pagar</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Valor/Hora</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Descontos</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Medição Final (planilha)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Recalculado</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Diferença</TableHead>
                    <TableHead className="whitespace-nowrap">Observações</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {validas.slice(0, 5).map((l) => {
                      const garantiaReal = Math.max(l.garantia, l.horas_liquidas);
                      const divergente = l.valor_planilha && Math.abs(l.diferenca_calc) > 0.10;
                      return (
                        <TableRow key={`sample-${l.rowExcel}`} className={divergente ? "bg-destructive/5" : undefined}>
                          <TableCell className="whitespace-nowrap">{fmtCompetencia(l.mes_ref)}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">{l.numero_dj || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={l.contratado}>{l.contratado || "—"}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">{l.codigo_cliente || "—"}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{l.tipo_equip || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{l.modelo || "—"}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">{l.serie || "—"}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">{l.tag || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{l.centro_custo || "—"}</TableCell>
                          <TableCell className="num text-right">{fmtNum(l.hor_inicial)}</TableCell>
                          <TableCell className="num text-right">{fmtNum(l.hor_final)}</TableCell>
                          <TableCell className="num text-right">{fmtNum(l.ht_calculado)}</TableCell>
                          <TableCell className="num text-right">{fmtNum(l.ht_informado)}</TableCell>
                          <TableCell className="num text-right">{fmtNum(l.garantia)}</TableCell>
                          <TableCell className="num text-right">{fmtNum(garantiaReal)}</TableCell>
                          <TableCell className="num text-right">{fmtNum(l.horas_disp)}</TableCell>
                          <TableCell className="num text-right">{fmtNum(l.horas_mec)}</TableCell>
                          <TableCell className="num text-right font-semibold">{fmtNum(l.horas_a_pagar)}</TableCell>
                          <TableCell className="num text-right">{fmtBRL(l.valor_hora)}</TableCell>
                          <TableCell className="num text-right">{fmtBRL(l.desc_manutencao)}</TableCell>
                          <TableCell className="num text-right">{l.valor_planilha ? fmtBRL(l.valor_planilha) : "—"}</TableCell>
                          <TableCell className="num text-right font-semibold text-primary">{fmtBRL(l.valor_final)}</TableCell>
                          <TableCell className={`num text-right ${divergente ? "text-destructive font-semibold" : ""}`} title={divergente ? "Divergência entre valor da planilha e valor recalculado." : ""}>
                            {l.valor_planilha ? fmtBRL(l.diferenca_calc) : "—"}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate" title={l.observacoes}>{l.observacoes || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {linhasComDivergencia > 0 && (
                <p className="mt-2 text-xs text-destructive">
                  ⚠ {linhasComDivergencia} linha(s) com divergência maior que R$ 0,10 entre o valor da planilha e o valor recalculado.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Nada foi salvo ainda. Revise os dados e clique em <strong>Confirmar importação</strong> para gravar, ou em <strong>Cancelar</strong> para descartar.
              </p>
            </CardContent></Card>
          )}

          {validas.length > 0 && modelo !== "M1" && modelo !== "M3" && (
            <Card className="mb-4"><CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Amostra do mapeamento — primeiras 5 linhas válidas</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Tipo Serviço</TableHead>
                    <TableHead>Tipo Equipamento</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Série</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead>Período Início</TableHead>
                    <TableHead>Período Fim</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {validas.slice(0, 5).map((l) => (
                      <TableRow key={`sample-${l.rowExcel}`}>
                        <TableCell className="text-xs">{l.tipo_servico || "—"}</TableCell>
                        <TableCell className="text-xs font-medium">{l.tipo_equip || "—"}</TableCell>
                        <TableCell className="text-xs">{l.modelo || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.serie || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.tag || "—"}</TableCell>
                        <TableCell className="text-xs num">{fmtDate(l.periodo_inicio)}</TableCell>
                        <TableCell className="text-xs num">{fmtDate(l.periodo_fim)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          )}

          {ignoradas.length > 0 && (
            <Card className="mb-4"><CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Linhas ignoradas ({ignoradas.length})</h3>
              <div className="max-h-[240px] overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-20">Linha</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Conteúdo</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {ignoradas.slice(0, 200).map((i) => (
                      <TableRow key={i.rowExcel}>
                        <TableCell className="font-mono text-xs">{i.rowExcel}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{i.motivo}</TableCell>
                        <TableCell className="text-xs max-w-[400px] truncate">{i.preview}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {ignoradas.length > 200 && <p className="mt-2 text-xs text-muted-foreground">... primeiras 200 de {ignoradas.length}</p>}
              </div>
            </CardContent></Card>
          )}

          {linhas.length > 0 && (
            <Card><CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span className="font-medium">{filename}</span>
                <span className="text-muted-foreground">({linhas.length} linhas processadas)</span>
              </div>
              <div className="max-h-[500px] overflow-auto border rounded-md">
                <Table className="min-w-max text-xs">
                  <TableHeader><TableRow>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Linha</TableHead>
                    <TableHead className="whitespace-nowrap">Mês</TableHead>
                    <TableHead className="whitespace-nowrap">Nº DJ</TableHead>
                    <TableHead className="whitespace-nowrap">Contratado</TableHead>
                    <TableHead className="whitespace-nowrap">Série</TableHead>
                    <TableHead className="whitespace-nowrap">Tag</TableHead>
                    <TableHead className="text-right whitespace-nowrap">HT Calc.</TableHead>
                    <TableHead className="text-right whitespace-nowrap">HT Inf.</TableHead>
                    <TableHead className="text-right whitespace-nowrap">H. pagar</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Valor planilha</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Valor final</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Diferença</TableHead>
                    <TableHead className="whitespace-nowrap">Mensagens</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {linhas.slice(0, 300).map((l) => {
                      const divergente = !!l.valor_planilha && Math.abs(l.diferenca_calc) > 0.10;
                      return (
                        <TableRow key={l.rowExcel}>
                          <TableCell className="whitespace-nowrap">{l.erros.length === 0 ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-destructive" />}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">{l.rowExcel}</TableCell>
                          <TableCell className="num whitespace-nowrap">{l.mes_ref ? fmtCompetencia(l.mes_ref) : "?"}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">{l.numero_dj}</TableCell>
                          <TableCell className="max-w-[220px] truncate" title={l.contratado}>{l.contratado}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">{l.serie}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">{l.tag}</TableCell>
                          <TableCell className="num text-right whitespace-nowrap">{fmtNum(l.ht_calculado)}</TableCell>
                          <TableCell className="num text-right whitespace-nowrap">{fmtNum(l.ht_informado)}</TableCell>
                          <TableCell className="num text-right whitespace-nowrap">{fmtNum(l.horas_a_pagar)}</TableCell>
                          <TableCell className="num text-right whitespace-nowrap">{l.valor_planilha ? fmtBRL(l.valor_planilha) : "—"}</TableCell>
                          <TableCell className="num text-right font-medium whitespace-nowrap">{fmtBRL(l.valor_final)}</TableCell>
                          <TableCell
                            className={`num text-right whitespace-nowrap ${divergente ? "text-destructive font-semibold" : ""}`}
                            title={divergente ? "Divergência entre valor da planilha e valor recalculado." : ""}
                          >
                            {l.valor_planilha ? fmtBRL(l.diferenca_calc) : "—"}
                          </TableCell>
                          <TableCell>
                            {l.erros.map((e, j) => <div key={j} className="text-destructive">• {e}</div>)}
                            {l.alertas.map((a, j) => <div key={j} className="text-warning">⚠ {a}</div>)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {linhas.length > 300 && <p className="m-2 text-xs text-muted-foreground">... primeiras 300 de {linhas.length}</p>}
              </div>
            </CardContent></Card>
          )}
        </>
      )}

      <ImportConflitoDialog
        open={conflitoOpen}
        conflitos={conflitos}
        onResolve={onResolveConflitos}
        onCancel={onCancelConflitos}
      />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold num ${highlight ? "text-primary" : ""}`} title={value}>{value}</div>
    </div>
  );
}
