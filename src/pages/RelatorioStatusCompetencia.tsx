import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { fmtBRL, fmtCompetencia, fmtDate, fmtNum } from "@/lib/format";
import { labelStatus, MedicaoStatus, STATUS_BADGE_VARIANT } from "@/lib/medicaoStatus";
import { labelFatStatus } from "@/lib/faturamentoStatus";
import { FileDown, FileSpreadsheet, Filter, RotateCcw, Eye, Receipt, AlertTriangle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const ALL = "__all__";

type Medicao = any;
type Contrato = any;
type Cliente = any;
type Fatura = any;

const STATUS_ORDER: MedicaoStatus[] = [
  "rascunho", "em_revisao_interna", "aprovada_internamente",
  "enviada_cliente", "aprovada_cliente", "faturada", "paga", "cancelada",
];

const STATUS_PENDENTES: MedicaoStatus[] = [
  "rascunho", "em_revisao_interna", "aprovada_internamente", "enviada_cliente",
];

const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#f59e0b", "#10b981", "#06b6d4", "#16a34a", "#ef4444"];

function competenciaKey(d: string | null | undefined) {
  if (!d) return "";
  return String(d).slice(0, 7);
}

export default function RelatorioStatusCompetencia() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [faturas, setFaturas] = useState<Fatura[]>([]);

  const [filtros, setFiltros] = useState({
    competencia: "",
    periodoIni: "",
    periodoFim: "",
    clienteId: ALL,
    fornecedor: ALL,
    contratoId: ALL,
    centroCusto: ALL,
    tipoServico: ALL,
    statusMed: ALL,
    statusFat: ALL,
    apenasAtivas: true,
    exibirCanceladas: true,
    exibirVersoesAnteriores: false,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [m, c, cl, f] = await Promise.all([
        supabase.from("medicoes").select("id,contrato_id,competencia,periodo_inicio,periodo_fim,status,valor_final,total_horas_informadas,total_horas_pagar,ativa,versao,medicao_original_id,enviada_cliente_em,aprovada_cliente_em,created_at,observacoes").limit(5000),
        supabase.from("contratos").select("id,cliente_id,numero_dj,centro_custo,tipo_servico,fornecedor_nome").limit(2000),
        supabase.from("clientes").select("id,razao_social,nome_fantasia,cnpj,endereco").limit(2000),
        supabase.from("faturas").select("id,medicao_id,status,valor,valor_recebido,data_emissao,data_vencimento,data_pagamento,numero_nf").limit(5000),
      ]);
      setMedicoes(m.data || []);
      setContratos(c.data || []);
      setClientes(cl.data || []);
      setFaturas(f.data || []);

      // Default: most recent competência
      const comps = Array.from(new Set((m.data || []).map((x: any) => competenciaKey(x.competencia)).filter(Boolean))).sort().reverse();
      if (comps[0]) setFiltros(prev => ({ ...prev, competencia: comps[0] as string }));
      setLoading(false);
    })();
  }, []);

  const contratosById = useMemo(() => Object.fromEntries(contratos.map(c => [c.id, c])), [contratos]);
  const clientesById = useMemo(() => Object.fromEntries(clientes.map(c => [c.id, c])), [clientes]);
  const faturasByMed = useMemo(() => {
    const map: Record<string, Fatura[]> = {};
    faturas.forEach(f => { (map[f.medicao_id] ||= []).push(f); });
    return map;
  }, [faturas]);

  const competencias = useMemo(
    () => Array.from(new Set(medicoes.map(m => competenciaKey(m.competencia)).filter(Boolean))).sort().reverse(),
    [medicoes],
  );

  const centrosUnicos = useMemo(
    () => Array.from(new Set(contratos.map(c => c.centro_custo).filter(Boolean))) as string[],
    [contratos],
  );
  const fornecedoresUnicos = useMemo(
    () => Array.from(new Set(contratos.map(c => c.fornecedor_nome).filter(Boolean))) as string[],
    [contratos],
  );
  const tiposUnicos = useMemo(
    () => Array.from(new Set(contratos.map(c => c.tipo_servico).filter(Boolean))) as string[],
    [contratos],
  );

  // Apply filters
  const medFiltradas = useMemo(() => {
    return medicoes.filter(m => {
      const ct = contratosById[m.contrato_id];
      if (filtros.apenasAtivas && !m.ativa) return false;
      if (!filtros.exibirVersoesAnteriores && !m.ativa && !filtros.exibirCanceladas) return false;
      if (!filtros.exibirCanceladas && m.status === "cancelada") return false;
      if (filtros.competencia && competenciaKey(m.competencia) !== filtros.competencia) {
        if (!filtros.periodoIni && !filtros.periodoFim) return false;
      }
      if (filtros.periodoIni && m.competencia < filtros.periodoIni) return false;
      if (filtros.periodoFim && m.competencia > filtros.periodoFim) return false;
      if (filtros.clienteId !== ALL && ct?.cliente_id !== filtros.clienteId) return false;
      if (filtros.contratoId !== ALL && m.contrato_id !== filtros.contratoId) return false;
      if (filtros.centroCusto !== ALL && ct?.centro_custo !== filtros.centroCusto) return false;
      if (filtros.tipoServico !== ALL && ct?.tipo_servico !== filtros.tipoServico) return false;
      if (filtros.fornecedor !== ALL && ct?.fornecedor_nome !== filtros.fornecedor) return false;
      if (filtros.statusMed !== ALL && m.status !== filtros.statusMed) return false;
      if (filtros.statusFat !== ALL) {
        const fats = (faturasByMed[m.id] || []).filter(f => f.status !== "cancelado");
        if (filtros.statusFat === "sem_fatura") {
          if (fats.length > 0) return false;
        } else if (!fats.some(f => f.status === filtros.statusFat)) return false;
      }
      return true;
    });
  }, [medicoes, contratosById, faturasByMed, filtros]);

  // Build flat rows enriched
  const rows = useMemo(() => {
    return medFiltradas.map(m => {
      const ct = contratosById[m.contrato_id];
      const cl = ct ? clientesById[ct.cliente_id] : null;
      const fats = (faturasByMed[m.id] || []).filter(f => f.status !== "cancelado");
      const fat = fats[0]; // a fatura ativa
      const valorFat = fats.reduce((s, f) => s + Number(f.valor || 0), 0);
      const valorRec = fats.reduce((s, f) => s + Number(f.valor_recebido || 0), 0);
      const saldo = Math.max(0, valorFat - valorRec);
      return {
        id: m.id, m, ct, cl, fat, fats,
        competencia: competenciaKey(m.competencia),
        cliente: cl?.razao_social || "—",
        contrato: ct?.numero_dj || "—",
        centro: ct?.centro_custo || "—",
        tipo: ct?.tipo_servico || "—",
        fornecedor: ct?.fornecedor_nome || "—",
        valor: Number(m.valor_final || 0),
        valorFat, valorRec, saldo,
        statusFat: fat?.status || "sem_fatura",
        numero_nf: fat?.numero_nf || "—",
      };
    });
  }, [medFiltradas, contratosById, clientesById, faturasByMed]);

  const rowsAtivasNaoCanceladas = useMemo(() => rows.filter(r => r.m.status !== "cancelada"), [rows]);
  const rowsCanceladas = useMemo(() => rows.filter(r => r.m.status === "cancelada"), [rows]);

  const totMedido = rowsAtivasNaoCanceladas.reduce((s, r) => s + r.valor, 0);
  const totAprovado = rowsAtivasNaoCanceladas.filter(r => ["aprovada_cliente", "faturada", "paga"].includes(r.m.status)).reduce((s, r) => s + r.valor, 0);
  const totFaturado = rowsAtivasNaoCanceladas.reduce((s, r) => s + r.valorFat, 0);
  const totRecebido = rowsAtivasNaoCanceladas.reduce((s, r) => s + r.valorRec, 0);
  const totAberto = Math.max(0, totFaturado - totRecebido);
  const totCancelado = rowsCanceladas.reduce((s, r) => s + r.valor, 0);
  const todayISO = new Date().toISOString().slice(0, 10);
  const totAtraso = rowsAtivasNaoCanceladas.reduce((s, r) => {
    return s + r.fats.filter((f: any) => f.status !== "pago" && f.data_vencimento && f.data_vencimento < todayISO)
      .reduce((ss: number, f: any) => ss + Math.max(0, Number(f.valor || 0) - Number(f.valor_recebido || 0)), 0);
  }, 0);
  const qtdPendentes = rowsAtivasNaoCanceladas.filter(r => STATUS_PENDENTES.includes(r.m.status)).length;
  const aFaturar = rowsAtivasNaoCanceladas.filter(r => r.m.status === "aprovada_cliente" && r.fats.length === 0).reduce((s, r) => s + r.valor, 0);
  const pctFat = totAprovado > 0 ? (totFaturado / totAprovado) * 100 : 0;
  const pctRec = totFaturado > 0 ? (totRecebido / totFaturado) * 100 : 0;

  // Resumo por status
  const resumoStatus = useMemo(() => {
    return STATUS_ORDER.map(st => {
      const list = rows.filter(r => r.m.status === st);
      const valor = list.reduce((s, r) => s + r.valor, 0);
      const pct = totMedido > 0 && st !== "cancelada" ? (valor / totMedido) * 100 : 0;
      return { status: st, label: labelStatus(st), qtd: list.length, valor, pct };
    });
  }, [rows, totMedido]);

  // Agrupado por competência
  const porCompetencia = useMemo(() => {
    const map: Record<string, typeof rows> = {};
    rows.forEach(r => { (map[r.competencia] ||= []).push(r); });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  // Gráficos
  const dataStatusQtd = resumoStatus.filter(r => r.qtd > 0).map(r => ({ name: r.label, qtd: r.qtd, valor: r.valor }));
  const evolucaoMensal = useMemo(() => {
    const m: Record<string, { medido: number; aprovado: number; faturado: number; recebido: number }> = {};
    rowsAtivasNaoCanceladas.forEach(r => {
      const k = r.competencia;
      m[k] ||= { medido: 0, aprovado: 0, faturado: 0, recebido: 0 };
      m[k].medido += r.valor;
      if (["aprovada_cliente", "faturada", "paga"].includes(r.m.status)) m[k].aprovado += r.valor;
      m[k].faturado += r.valorFat;
      m[k].recebido += r.valorRec;
    });
    return Object.entries(m).sort().map(([k, v]) => ({ comp: fmtCompetencia(k), ...v }));
  }, [rowsAtivasNaoCanceladas]);

  const topClientes = useMemo(() => {
    const map: Record<string, number> = {};
    rowsAtivasNaoCanceladas.forEach(r => { map[r.cliente] = (map[r.cliente] || 0) + r.valor; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, valor]) => ({ name, valor }));
  }, [rowsAtivasNaoCanceladas]);

  const topContratos = useMemo(() => {
    const map: Record<string, number> = {};
    rowsAtivasNaoCanceladas.forEach(r => { map[r.contrato] = (map[r.contrato] || 0) + r.valor; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, valor]) => ({ name, valor }));
  }, [rowsAtivasNaoCanceladas]);

  // Insights
  const insights = useMemo(() => {
    const out: string[] = [];
    const aprovSemFat = rowsAtivasNaoCanceladas.filter(r => r.m.status === "aprovada_cliente" && r.fats.length === 0);
    if (qtdPendentes) out.push(`Existem ${qtdPendentes} medições pendentes de aprovação.`);
    if (aprovSemFat.length) out.push(`${aprovSemFat.length} medições aprovadas pelo cliente ainda não faturadas, totalizando ${fmtBRL(aprovSemFat.reduce((s, r) => s + r.valor, 0))}.`);
    if (totAberto > 0) out.push(`Faturamentos em aberto: ${fmtBRL(totAberto)}.`);
    if (totAtraso > 0) out.push(`Faturamentos em atraso: ${fmtBRL(totAtraso)}.`);
    if (topClientes[0]) {
      const pct = totMedido > 0 ? (topClientes[0].valor / totMedido) * 100 : 0;
      out.push(`Cliente ${topClientes[0].name} representa ${pct.toFixed(1)}% do valor medido.`);
    }
    if (topContratos[0]) out.push(`Maior contrato: ${topContratos[0].name} com ${fmtBRL(topContratos[0].valor)} medidos.`);
    if (rowsCanceladas.length) out.push(`${rowsCanceladas.length} medições canceladas no período (valor histórico ${fmtBRL(totCancelado)}).`);
    const semForn = rowsAtivasNaoCanceladas.filter(r => r.fornecedor === "—").length;
    if (semForn) out.push(`${semForn} medições sem fornecedor/locadora preenchido.`);
    const clienteSemCnpj = rowsAtivasNaoCanceladas.filter(r => r.cl && !r.cl.cnpj).length;
    if (clienteSemCnpj) out.push(`${clienteSemCnpj} medições com cliente sem CNPJ cadastrado.`);
    return out;
  }, [rowsAtivasNaoCanceladas, rowsCanceladas, qtdPendentes, totAberto, totAtraso, totCancelado, totMedido, topClientes, topContratos]);

  // Inconsistências por linha
  function inconsistencias(r: any): string[] {
    const out: string[] = [];
    if (r.m.status === "aprovada_cliente" && r.fats.length === 0) out.push("Aprovada sem faturamento");
    if (r.fats.length > 0 && r.fats.every((f: any) => !f.numero_nf)) out.push("Faturada sem NF");
    if (r.fats.some((f: any) => !f.data_vencimento)) out.push("Faturamento sem vencimento");
    if (r.fats.some((f: any) => f.status !== "pago" && f.data_vencimento && f.data_vencimento < todayISO)) out.push("Faturamento vencido");
    if (r.cl && !r.cl.cnpj) out.push("Cliente sem CNPJ");
    return out;
  }

  const limparFiltros = () => setFiltros({
    competencia: competencias[0] || "",
    periodoIni: "", periodoFim: "",
    clienteId: ALL, fornecedor: ALL, contratoId: ALL, centroCusto: ALL, tipoServico: ALL,
    statusMed: ALL, statusFat: ALL,
    apenasAtivas: true, exibirCanceladas: true, exibirVersoesAnteriores: false,
  });

  // ===== EXPORT PDF =====
  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const margin = 32;
    let y = margin;
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Relatório de Status das Medições por Competência", margin, y); y += 18;
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    const compTxt = filtros.competencia ? fmtCompetencia(filtros.competencia) : "Todas";
    doc.text(`Competência: ${compTxt}   |   Período: ${filtros.periodoIni || "-"} a ${filtros.periodoFim || "-"}`, margin, y); y += 12;
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}   |   Usuário: ${user?.email || "-"}`, margin, y); y += 16;

    // Resumo executivo
    autoTable(doc, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total medido", fmtBRL(totMedido)],
        ["Aprovado pelo cliente", fmtBRL(totAprovado)],
        ["Faturado", fmtBRL(totFaturado)],
        ["Recebido", fmtBRL(totRecebido)],
        ["Em aberto", fmtBRL(totAberto)],
        ["Em atraso", fmtBRL(totAtraso)],
        ["Pendentes (qtd)", String(qtdPendentes)],
        ["Canceladas (hist.)", `${rowsCanceladas.length} / ${fmtBRL(totCancelado)}`],
        ["% Faturado", `${pctFat.toFixed(1)}%`],
        ["% Recebido", `${pctRec.toFixed(1)}%`],
      ],
      styles: { fontSize: 8 }, headStyles: { fillColor: [37, 99, 235] }, margin: { left: margin, right: margin },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 12;

    // Resumo por status
    autoTable(doc, {
      startY: y,
      head: [["Status", "Qtd", "Valor", "%"]],
      body: resumoStatus.filter(r => r.qtd > 0).map(r => [r.label, String(r.qtd), fmtBRL(r.valor), `${r.pct.toFixed(1)}%`]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [37, 99, 235] }, margin: { left: margin, right: margin },
      theme: "striped",
    });
    y = (doc as any).lastAutoTable.finalY + 12;

    // Tabela detalhada
    autoTable(doc, {
      startY: y,
      head: [["Competência", "Cliente", "Contrato", "C.Custo", "Valor", "Status Med.", "Status Fat.", "NF", "Faturado", "Recebido", "Saldo"]],
      body: rows.map(r => [
        fmtCompetencia(r.competencia), r.cliente, r.contrato, r.centro,
        fmtBRL(r.valor), labelStatus(r.m.status), labelFatStatus(r.statusFat),
        r.numero_nf, fmtBRL(r.valorFat), fmtBRL(r.valorRec), fmtBRL(r.saldo),
      ]),
      styles: { fontSize: 7 }, headStyles: { fillColor: [37, 99, 235] }, margin: { left: margin, right: margin },
      theme: "grid",
      didDrawPage: (data) => {
        const str = `Página ${doc.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.text(str, doc.internal.pageSize.getWidth() - margin - 40, doc.internal.pageSize.getHeight() - 16);
      },
    });

    // Insights
    if (insights.length) {
      doc.addPage("a4", "landscape");
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text("Insights da Competência", margin, margin);
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      insights.forEach((t, i) => doc.text(`• ${t}`, margin, margin + 20 + i * 14));
    }

    doc.save(`status-competencia-${filtros.competencia || "todas"}.pdf`);
  }

  // ===== EXPORT EXCEL =====
  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const resumo = [
      ["Indicador", "Valor"],
      ["Competência", filtros.competencia ? fmtCompetencia(filtros.competencia) : "Todas"],
      ["Total medido", totMedido],
      ["Aprovado pelo cliente", totAprovado],
      ["Faturado", totFaturado],
      ["Recebido", totRecebido],
      ["Em aberto", totAberto],
      ["Em atraso", totAtraso],
      ["Pendentes (qtd)", qtdPendentes],
      ["Canceladas (qtd)", rowsCanceladas.length],
      ["Canceladas (valor)", totCancelado],
      ["% Faturado", pctFat],
      ["% Recebido", pctRec],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");

    const detalhe = [[
      "Competência", "Cliente", "Contrato/DJ", "Centro Custo", "Tipo Serviço", "Fornecedor",
      "Período Início", "Período Fim", "Horas Informadas", "Horas a Pagar", "Valor Final",
      "Status Medição", "Data Criação", "Envio Cliente", "Aprovação Cliente",
      "Status Faturamento", "NF", "Valor Faturado", "Data Emissão", "Data Vencimento",
      "Valor Recebido", "Saldo", "Observações",
    ], ...rows.map(r => [
      fmtCompetencia(r.competencia), r.cliente, r.contrato, r.centro, r.tipo, r.fornecedor,
      r.m.periodo_inicio, r.m.periodo_fim,
      Number(r.m.total_horas_informadas || 0), Number(r.m.total_horas_pagar || 0), r.valor,
      labelStatus(r.m.status), r.m.created_at?.slice(0, 10), r.m.enviada_cliente_em?.slice(0, 10) || "", r.m.aprovada_cliente_em?.slice(0, 10) || "",
      labelFatStatus(r.statusFat), r.numero_nf, r.valorFat, r.fat?.data_emissao || "", r.fat?.data_vencimento || "",
      r.valorRec, r.saldo, r.m.observacoes || "",
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalhe), "Medições detalhadas");

    const porStatus = [["Status", "Qtd", "Valor", "%"],
      ...resumoStatus.map(r => [r.label, r.qtd, r.valor, r.pct])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porStatus), "Resumo por status");

    const fatRows = [["Competência", "Cliente", "Contrato", "NF", "Valor", "Recebido", "Saldo", "Status", "Vencimento", "Pagamento"]];
    rows.forEach(r => r.fats.forEach((f: any) => {
      fatRows.push([fmtCompetencia(r.competencia), r.cliente, r.contrato, f.numero_nf || "",
        Number(f.valor || 0), Number(f.valor_recebido || 0), Math.max(0, Number(f.valor || 0) - Number(f.valor_recebido || 0)),
        labelFatStatus(f.status), f.data_vencimento || "", f.data_pagamento || ""]);
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fatRows), "Faturamento");

    if (rowsCanceladas.length || filtros.exibirVersoesAnteriores) {
      const canc = [["Competência", "Cliente", "Contrato", "Valor", "Status", "Versão", "Ativa"]];
      rows.filter(r => r.m.status === "cancelada" || !r.m.ativa).forEach(r => {
        canc.push([fmtCompetencia(r.competencia), r.cliente, r.contrato, r.valor, labelStatus(r.m.status), r.m.versao, r.m.ativa]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(canc), "Canceladas e versões");
    }

    XLSX.writeFile(wb, `status-competencia-${filtros.competencia || "todas"}.xlsx`);
  }

  // ============== RENDER ==============
  const renderTable = (list: typeof rows) => (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Competência</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Contrato</TableHead>
            <TableHead>C. Custo</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status Med.</TableHead>
            <TableHead>Status Fat.</TableHead>
            <TableHead>NF</TableHead>
            <TableHead className="text-right">Faturado</TableHead>
            <TableHead className="text-right">Recebido</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>Alertas</TableHead>
            <TableHead>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map(r => {
            const inc = inconsistencias(r);
            return (
              <TableRow key={r.id}>
                <TableCell>{fmtCompetencia(r.competencia)}</TableCell>
                <TableCell className="max-w-[200px] truncate" title={r.cliente}>{r.cliente}</TableCell>
                <TableCell>{r.contrato}</TableCell>
                <TableCell>{r.centro}</TableCell>
                <TableCell className="max-w-[160px] truncate" title={r.fornecedor}>{r.fornecedor}</TableCell>
                <TableCell className="text-right num font-medium">{fmtBRL(r.valor)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[r.m.status as MedicaoStatus] || "secondary"}>
                    {labelStatus(r.m.status)}
                  </Badge>
                </TableCell>
                <TableCell><Badge variant="outline">{labelFatStatus(r.statusFat)}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{r.numero_nf}</TableCell>
                <TableCell className="text-right num">{fmtBRL(r.valorFat)}</TableCell>
                <TableCell className="text-right num">{fmtBRL(r.valorRec)}</TableCell>
                <TableCell className="text-right num">{fmtBRL(r.saldo)}</TableCell>
                <TableCell>
                  {inc.length > 0 && (
                    <span title={inc.join(" • ")} className="inline-flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> {inc.length}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button asChild size="icon" variant="ghost" title="Abrir medição">
                      <Link to={`/medicoes/${r.id}`}><Eye className="h-4 w-4" /></Link>
                    </Button>
                    {r.fat && (
                      <Button asChild size="icon" variant="ghost" title="Abrir faturamento">
                        <Link to={`/faturamento/${r.fat.id}`}><Receipt className="h-4 w-4" /></Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {list.length === 0 && (
            <TableRow><TableCell colSpan={14} className="text-center text-sm text-muted-foreground py-8">Nenhuma medição encontrada.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Relatório de Status das Medições por Competência"
        description="Visão executiva de medições, faturamentos e recebimentos por competência"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportPDF}><FileDown className="mr-1 h-4 w-4" />PDF</Button>
            <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
          </div>
        }
      />

      {/* Filtros */}
      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" />Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <div>
            <Label className="text-xs">Competência</Label>
            <Select value={filtros.competencia || ALL} onValueChange={v => setFiltros(f => ({ ...f, competencia: v === ALL ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {competencias.map(c => <SelectItem key={c} value={c}>{fmtCompetencia(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Período inicial</Label><Input type="date" value={filtros.periodoIni} onChange={e => setFiltros(f => ({ ...f, periodoIni: e.target.value }))} /></div>
          <div><Label className="text-xs">Período final</Label><Input type="date" value={filtros.periodoFim} onChange={e => setFiltros(f => ({ ...f, periodoFim: e.target.value }))} /></div>
          <div>
            <Label className="text-xs">Cliente</Label>
            <Select value={filtros.clienteId} onValueChange={v => setFiltros(f => ({ ...f, clienteId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Contrato</Label>
            <Select value={filtros.contratoId} onValueChange={v => setFiltros(f => ({ ...f, contratoId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {contratos.filter(c => filtros.clienteId === ALL || c.cliente_id === filtros.clienteId).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.numero_dj}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fornecedor</Label>
            <Select value={filtros.fornecedor} onValueChange={v => setFiltros(f => ({ ...f, fornecedor: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {fornecedoresUnicos.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Centro de custo</Label>
            <Select value={filtros.centroCusto} onValueChange={v => setFiltros(f => ({ ...f, centroCusto: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {centrosUnicos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo de serviço</Label>
            <Select value={filtros.tipoServico} onValueChange={v => setFiltros(f => ({ ...f, tipoServico: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {tiposUnicos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status medição</Label>
            <Select value={filtros.statusMed} onValueChange={v => setFiltros(f => ({ ...f, statusMed: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{labelStatus(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status faturamento</Label>
            <Select value={filtros.statusFat} onValueChange={v => setFiltros(f => ({ ...f, statusFat: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="sem_fatura">Sem faturamento</SelectItem>
                <SelectItem value="a_faturar">A faturar</SelectItem>
                <SelectItem value="nf_emitida">NF emitida</SelectItem>
                <SelectItem value="aguardando_pagamento">Aguardando pagamento</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="em_atraso">Em atraso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-wrap items-end gap-4 lg:col-span-4">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={filtros.apenasAtivas} onCheckedChange={v => setFiltros(f => ({ ...f, apenasAtivas: !!v }))} /> Apenas ativas</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={filtros.exibirCanceladas} onCheckedChange={v => setFiltros(f => ({ ...f, exibirCanceladas: !!v }))} /> Exibir canceladas</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={filtros.exibirVersoesAnteriores} onCheckedChange={v => setFiltros(f => ({ ...f, exibirVersoesAnteriores: !!v }))} /> Versões anteriores</label>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={limparFiltros}><RotateCcw className="mr-1 h-4 w-4" />Limpar</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards executivos */}
      <div className="grid gap-3 mb-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KCard label="Total medido" value={fmtBRL(totMedido)} />
        <KCard label="Aprovado pelo cliente" value={fmtBRL(totAprovado)} />
        <KCard label="Faturado" value={fmtBRL(totFaturado)} />
        <KCard label="Recebido" value={fmtBRL(totRecebido)} tone="success" />
        <KCard label="Em aberto" value={fmtBRL(totAberto)} tone="warning" />
        <KCard label="A faturar" value={fmtBRL(aFaturar)} />
        <KCard label="Em atraso" value={fmtBRL(totAtraso)} tone="danger" />
        <KCard label="Pendentes" value={String(qtdPendentes)} />
        <KCard label="% Faturado" value={`${pctFat.toFixed(1)}%`} />
        <KCard label="% Recebido" value={`${pctRec.toFixed(1)}%`} />
      </div>

      {/* Resumo por status */}
      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-base">Resumo por status</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {resumoStatus.filter(r => r.qtd > 0).map(r => (
              <div key={r.status} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.qtd} medições · {r.status !== "cancelada" ? `${r.pct.toFixed(1)}%` : "histórico"}</div>
                </div>
                <div className="num font-semibold">{fmtBRL(r.valor)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Medições por status (qtd)</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dataStatusQtd} dataKey="qtd" nameKey="name" outerRadius={90} label>
                  {dataStatusQtd.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Valor por status</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataStatusQtd}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                <Bar dataKey="valor" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {evolucaoMensal.length > 1 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-base">Evolução por competência</CardTitle></CardHeader>
            <CardContent style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="comp" /><YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmtBRL(Number(v))} /><Legend />
                  <Line type="monotone" dataKey="medido" stroke="#2563eb" />
                  <Line type="monotone" dataKey="aprovado" stroke="#10b981" />
                  <Line type="monotone" dataKey="faturado" stroke="#f59e0b" />
                  <Line type="monotone" dataKey="recebido" stroke="#06b6d4" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top clientes</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topClientes} layout="vertical">
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                <Bar dataKey="valor" fill="#7c3aed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top contratos</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topContratos} layout="vertical">
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                <Bar dataKey="valor" fill="#0891b2" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-base">Insights da Competência</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {insights.map((t, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{t}</span></li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tabs detalhadas */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Medições</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="todas">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="todas">Todas ({rows.length})</TabsTrigger>
              <TabsTrigger value="pendentes">Pendentes ({rows.filter(r => STATUS_PENDENTES.includes(r.m.status)).length})</TabsTrigger>
              <TabsTrigger value="enviadas">Enviadas ({rows.filter(r => r.m.status === "enviada_cliente").length})</TabsTrigger>
              <TabsTrigger value="aprovadas">Aprovadas ({rows.filter(r => r.m.status === "aprovada_cliente").length})</TabsTrigger>
              <TabsTrigger value="faturadas">Faturadas ({rows.filter(r => r.m.status === "faturada").length})</TabsTrigger>
              <TabsTrigger value="pagas">Pagas ({rows.filter(r => r.m.status === "paga").length})</TabsTrigger>
              <TabsTrigger value="canceladas">Canceladas ({rowsCanceladas.length})</TabsTrigger>
              <TabsTrigger value="competencia">Por competência</TabsTrigger>
            </TabsList>
            <TabsContent value="todas">{renderTable(rows)}</TabsContent>
            <TabsContent value="pendentes">{renderTable(rows.filter(r => STATUS_PENDENTES.includes(r.m.status)))}</TabsContent>
            <TabsContent value="enviadas">{renderTable(rows.filter(r => r.m.status === "enviada_cliente"))}</TabsContent>
            <TabsContent value="aprovadas">{renderTable(rows.filter(r => r.m.status === "aprovada_cliente"))}</TabsContent>
            <TabsContent value="faturadas">{renderTable(rows.filter(r => r.m.status === "faturada"))}</TabsContent>
            <TabsContent value="pagas">{renderTable(rows.filter(r => r.m.status === "paga"))}</TabsContent>
            <TabsContent value="canceladas">{renderTable(rowsCanceladas)}</TabsContent>
            <TabsContent value="competencia">
              <div className="space-y-6">
                {porCompetencia.map(([k, list]) => {
                  const v = list.filter(r => r.m.status !== "cancelada").reduce((s, r) => s + r.valor, 0);
                  return (
                    <div key={k}>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-semibold">{fmtCompetencia(k)}</h3>
                        <div className="text-sm text-muted-foreground">{list.length} medições · <span className="num font-semibold text-foreground">{fmtBRL(v)}</span></div>
                      </div>
                      {renderTable(list)}
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {loading && <p className="mt-4 text-sm text-muted-foreground">Carregando...</p>}
    </div>
  );
}

function KCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" }) {
  const colorMap = {
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  } as const;
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 num text-lg font-bold ${tone ? colorMap[tone] : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
