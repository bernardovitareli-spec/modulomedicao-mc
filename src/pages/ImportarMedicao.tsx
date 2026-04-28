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
type ModeloLayout = "M1" | "M2";

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

  const onFile = async (file: File) => {
    setFilename(file.name);
    setLinhas([]); setIgnoradas([]); setHeaderError(""); setHeaderInfo(null); setModelo(null); setSheetUsed(""); setOverrides({}); setConfirmDivergencia(false);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });

      const sheetM1 = wb.SheetNames.find((n) => normalize(n) === normalize(SHEET_MODELO_1));
      const sheetM2 = wb.SheetNames.find((n) => normalize(n) === normalize(SHEET_MODELO_2));

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
  const cnpjEf = (l: LinhaLida) => (modelo === "M1" ? (ovOf(l.numero_dj).cnpj || l.cnpj) : l.cnpj);
  // No M1 o "código" extraído da planilha é o CÓDIGO DO FORNECEDOR (não cliente)
  const codFornecedorEf = (l: LinhaLida) => (modelo === "M1" ? l.codigo_cliente : "");
  const tipoServicoEf = (l: LinhaLida) => (modelo === "M1" ? (ovOf(l.numero_dj).tipo_servico || l.tipo_servico) : l.tipo_servico);
  const periodoIniEf = (l: LinhaLida) => (modelo === "M1" ? (ovOf(l.numero_dj).periodo_inicio || l.periodo_inicio || "") : (l.periodo_inicio || ""));
  const periodoFimEf = (l: LinhaLida) => (modelo === "M1" ? (ovOf(l.numero_dj).periodo_fim || l.periodo_fim || "") : (l.periodo_fim || ""));

  // Resumo agregado
  const clientes = Array.from(new Set(validas.map((l) => l.contratado)));
  const cnpjs = Array.from(new Set(validas.map(cnpjEf).filter(Boolean)));
  const codigosFornecedor = Array.from(new Set(validas.map(codFornecedorEf).filter(Boolean)));
  const contratos = Array.from(new Set(validas.map((l) => l.numero_dj)));
  const tiposServico = Array.from(new Set(validas.map(tipoServicoEf).filter(Boolean)));
  const centrosCusto = Array.from(new Set(validas.map((l) => l.centro_custo).filter(Boolean)));
  const competencias = Array.from(new Set(validas.map((l) => l.mes_ref).filter(Boolean) as string[]));
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

  // Validação: tipo_equip == tipo_servico em todos os itens (provável mapeamento errado)
  const itensComTipoEquip = validas.filter((l) => l.tipo_equip);
  const tipoEquipIgualServico =
    itensComTipoEquip.length > 0 &&
    itensComTipoEquip.every((l) => normalize(l.tipo_equip) === normalize(l.tipo_servico));
  const erroMapeamentoTipoEquip = modelo === "M2" && tipoEquipIgualServico;

  // Validação dos overrides obrigatórios M1
  const m1Pendencias: string[] = [];
  if (modelo === "M1") {
    const djs = Array.from(new Set(validas.map((l) => l.numero_dj)));
    for (const dj of djs) {
      const o = overrides[dj] ?? {};
      if (!o.tipo_servico) m1Pendencias.push(`Contrato ${dj}: tipo de serviço obrigatório`);
      if (!o.periodo_inicio) m1Pendencias.push(`Contrato ${dj}: período início obrigatório`);
      if (!o.periodo_fim) m1Pendencias.push(`Contrato ${dj}: período fim obrigatório`);
      if (o.periodo_inicio && o.periodo_fim && o.periodo_fim < o.periodo_inicio) {
        m1Pendencias.push(`Contrato ${dj}: período fim não pode ser anterior ao início`);
      }
    }
  }

  const precisaConfirmarDivergencia = modelo === "M1" && linhasComDivergencia > 0;
  const podeImportar =
    !headerError &&
    validas.length > 0 &&
    !erroMapeamentoTipoEquip &&
    m1Pendencias.length === 0 &&
    (!precisaConfirmarDivergencia || confirmDivergencia);

  const confirmar = async () => {
    if (!podeImportar) { toast.error("Não é possível importar"); return; }
    setImporting(true);
    try {
      const clientesCache = new Map<string, string>();
      const contratosCache = new Map<string, { id: string; valor_hora: number; garantia: number }>();
      const equipsCache = new Map<string, string>();
      const contratoEquipCache = new Map<string, string>();
      const medicoesCache = new Map<string, string>();

      const [{ data: cli }, { data: ctr }, { data: eqp }] = await Promise.all([
        supabase.from("clientes").select("id, razao_social"),
        supabase.from("contratos").select("id, numero_dj, valor_hora_padrao, garantia_minima_horas"),
        supabase.from("equipamentos").select("id, serie, tag"),
      ]);
      cli?.forEach((c: any) => clientesCache.set(c.razao_social.toUpperCase(), c.id));
      ctr?.forEach((c: any) => contratosCache.set(c.numero_dj, { id: c.id, valor_hora: Number(c.valor_hora_padrao ?? 0), garantia: Number(c.garantia_minima_horas ?? 0) }));
      eqp?.forEach((e: any) => equipsCache.set(`${e.serie ?? ""}|${e.tag ?? ""}`, e.id));

      let createdCli = 0, createdCtr = 0, createdEqp = 0, createdMed = 0, createdItens = 0;
      const periodoPorMedicao = new Map<string, { inicio: string; fim: string }>();

      for (const l of validas) {
        const ov = overrides[l.numero_dj] ?? {};
        const cnpjEfetivo = (ov.cnpj || l.cnpj || "").trim();
        const tipoServicoEfetivo = (ov.tipo_servico || l.tipo_servico || "Locação").trim();
        const periodoIniEfetivo = ov.periodo_inicio || l.periodo_inicio || null;
        const periodoFimEfetivo = ov.periodo_fim || l.periodo_fim || null;

        // No M1, "Contratado" da planilha = FORNECEDOR/LOCADORA
        // O CLIENTE/CONTRATANTE vem do override (ov.cliente_id)
        const isM1 = modelo === "M1";
        const fornecedorNome = isM1 ? l.contratado : "";
        const fornecedorCodigo = isM1 ? l.codigo_cliente : "";
        const fornecedorCnpj = isM1 ? cnpjEfetivo : "";

        let clienteId: string | undefined;
        if (isM1) {
          // Cliente/Contratante selecionado pelo usuário (validado em m1Pendencias)
          clienteId = ov.cliente_id;
          if (!clienteId) throw new Error(`Selecione o Cliente/Contratante para o contrato ${l.numero_dj}`);
        } else {
          // M2: lógica original — "Contratante" da planilha = cliente
          const cliKey = l.contratado.toUpperCase();
          clienteId = clientesCache.get(cliKey);
          if (!clienteId) {
            const { data, error } = await supabase.from("clientes").insert({
              razao_social: l.contratado,
              cnpj: cnpjEfetivo || null,
              codigo_cliente: l.codigo_cliente || null,
              status: "ativo",
            } as any).select("id").single();
            if (error) throw error;
            clienteId = data.id; clientesCache.set(cliKey, clienteId!); createdCli++;
          }
        }

        let contrato = contratosCache.get(l.numero_dj);
        if (!contrato) {
          const inicio = l.inicio_op ?? periodoIniEfetivo ?? (l.mes_ref ?? new Date().toISOString().slice(0, 10));
          const termino = l.termino_contrato ?? new Date(new Date(inicio).getFullYear() + 1, 11, 31).toISOString().slice(0, 10);
          const { data, error } = await supabase.from("contratos").insert({
            numero_dj: l.numero_dj, cliente_id: clienteId,
            tipo_servico: tipoServicoEfetivo,
            centro_custo: l.centro_custo || null,
            inicio_operacao: inicio, termino_contrato: termino,
            valor_hora_padrao: l.valor_hora, garantia_minima_horas: l.garantia,
            status: "ativo",
            fornecedor_nome: fornecedorNome || null,
            fornecedor_codigo: fornecedorCodigo || null,
            fornecedor_cnpj: fornecedorCnpj || null,
          } as any).select("id, valor_hora_padrao, garantia_minima_horas").single();
          if (error) throw error;
          contrato = { id: data.id, valor_hora: Number(data.valor_hora_padrao ?? 0), garantia: Number(data.garantia_minima_horas ?? 0) };
          contratosCache.set(l.numero_dj, contrato); createdCtr++;
        } else {
          const patch: any = { tipo_servico: tipoServicoEfetivo || undefined, centro_custo: l.centro_custo || null };
          if (isM1) {
            patch.cliente_id = clienteId;
            if (fornecedorNome) patch.fornecedor_nome = fornecedorNome;
            if (fornecedorCodigo) patch.fornecedor_codigo = fornecedorCodigo;
            if (fornecedorCnpj) patch.fornecedor_cnpj = fornecedorCnpj;
          }
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
            tag: l.tag,
            serie: l.serie,
            modelo: l.modelo || "—",
            tipo: l.tipo_equip || "—",
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

        const medKey = `${contrato.id}|${l.mes_ref}`;
        if (!periodoPorMedicao.has(medKey)) {
          const mesmasMedicao = validas.filter((x) => x.numero_dj === l.numero_dj && x.mes_ref === l.mes_ref);
          const inicios = mesmasMedicao.map((x) => x.periodo_inicio).filter(Boolean).sort() as string[];
          const fins = mesmasMedicao.map((x) => x.periodo_fim).filter(Boolean).sort() as string[];
          // Override M1 prevalece (período real informado pelo usuário)
          periodoPorMedicao.set(medKey, {
            inicio: periodoIniEfetivo ?? inicios[0] ?? l.mes_ref!,
            fim: periodoFimEfetivo ?? fins[fins.length - 1] ?? lastDayOfMonth(l.mes_ref!),
          });
        }
        const periodoMed = periodoPorMedicao.get(medKey)!;
        const periodoIniMed = periodoMed.inicio;
        const periodoFimMed = periodoMed.fim;
        let medicaoId = medicoesCache.get(medKey);
        if (!medicaoId) {
          const { data: existing } = await supabase.from("medicoes")
            .select("id").eq("contrato_id", contrato.id).eq("competencia", l.mes_ref!).maybeSingle();
          if (existing) {
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
            } as any).select("id").single();
            if (error) throw error;
            medicaoId = data.id; createdMed++;
          }
          medicoesCache.set(medKey, medicaoId);
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
          regras_aplicadas: calc.regras_aplicadas as any,
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

      toast.success(`Importação concluída: ${createdItens} itens em ${medicoesCache.size} medição(ões). ${createdCli} clientes, ${createdCtr} contratos, ${createdEqp} equipamentos novos.`);
      navigate("/medicoes");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally { setImporting(false); }
  };

  return (
    <div>
      <PageHeader
        title="Importar planilha de medição"
        description='Suporta layouts "BASE DE DADOS" (Modelo 1) e "Template Medição" (Modelo 2)'
        actions={<Button variant="outline" onClick={() => navigate("/medicoes")}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>}
      />

      <Card className="mb-4"><CardContent className="p-4">
        <Label>Arquivo Excel (.xlsx) *</Label>
        <Input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <p className="mt-2 text-xs text-muted-foreground">
          O sistema identifica automaticamente o modelo: aba <strong>"BASE DE DADOS"</strong> = Modelo 1, aba <strong>"Template Medição"</strong> = Modelo 2. Caso nenhuma exista, tenta localizar o cabeçalho automaticamente.
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
              <Stat label="Cliente(s)" value={clientes.length === 1 ? clientes[0] : String(clientes.length)} />
              <Stat label="CNPJ" value={cnpjs.length === 1 ? cnpjs[0] : (cnpjs.length ? `${cnpjs.length}` : "—")} />
              <Stat label="Código cliente" value={codigosCliente.length === 1 ? codigosCliente[0] : (codigosCliente.length ? `${codigosCliente.length}` : "—")} />
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
                <Button variant="outline" onClick={() => { setLinhas([]); setIgnoradas([]); setFilename(""); setHeaderInfo(null); setHeaderError(""); setOverrides({}); setConfirmDivergencia(false); }}>Cancelar</Button>
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
                      <div className="mb-2 text-xs font-medium">
                        Contrato <span className="font-mono">{dj}</span> · {linhaRef.contratado}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                        <div>
                          <Label className="text-xs">CNPJ do cliente</Label>
                          <Input value={ov.cnpj ?? ""} onChange={(e) => setOv({ cnpj: e.target.value })} placeholder="opcional" />
                        </div>
                        <div>
                          <Label className="text-xs">Código do cliente</Label>
                          <Input value={ov.codigo_cliente ?? ""} onChange={(e) => setOv({ codigo_cliente: e.target.value })} placeholder="ex: 15811" />
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

          {validas.length > 0 && modelo === "M1" && (
            <Card className="mb-4"><CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold">
                Amostra do mapeamento — Modelo M1 (aba "{sheetUsed}") — primeiras 5 linhas válidas
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

          {validas.length > 0 && modelo !== "M1" && (
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
