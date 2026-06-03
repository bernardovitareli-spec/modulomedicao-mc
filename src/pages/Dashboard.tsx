import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDashboardSnapshot } from "@/data/dashboard";
import { KPISkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtBRL, fmtNum, fmtDate, fmtCompetencia } from "@/lib/format";
import { labelStatus, MedicaoStatus } from "@/lib/medicaoStatus";
import { labelFatStatus, FaturamentoStatus } from "@/lib/faturamentoStatus";
import {
  FileText, ClipboardList, CheckCircle2, Receipt, AlertTriangle, TrendingUp,
  Wallet, BadgeDollarSign, Hourglass, Banknote, AlertCircle, Clock,
  Wrench, Activity, RefreshCw, Filter as FilterIcon, X, Database,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

type Medicao = {
  id: string; contrato_id: string; competencia: string;
  periodo_inicio: string; periodo_fim: string;
  status: MedicaoStatus; valor_final: number; valor_bruto: number;
  valor_descontos: number; valor_complementares: number;
  total_horas_informadas: number; total_horas_liquidas: number; total_horas_pagar: number;
  ativa: boolean; versao: number; medicao_original_id: string | null;
  aprovada_cliente_em: string | null; created_at: string; updated_at: string;
  motivo_reimportacao: string | null;
};
type Contrato = {
  id: string; cliente_id: string; numero_dj: string; centro_custo: string | null;
  tipo_servico: string; fornecedor_nome: string | null; status: string;
  inicio_operacao: string | null; termino_contrato: string | null;
};
type Cliente = {
  id: string; razao_social: string; nome_fantasia: string | null;
  cnpj: string | null; endereco: string | null; cidade: string | null; uf: string | null;
};
type Fatura = {
  id: string; medicao_id: string; status: FaturamentoStatus;
  valor: number; valor_recebido: number | null;
  data_emissao: string | null; data_vencimento: string | null;
  data_pagamento: string | null; numero_nf: string | null;
};

type Filtros = {
  periodoIni: string; periodoFim: string; competencia: string;
  clienteId: string; contratoId: string; centroCusto: string;
  fornecedor: string; tipoServico: string;
  statusMed: string; statusFat: string;
  apenasAtivas: boolean; exibirCanceladas: boolean; exibirVersoes: boolean;
};

const ALL = "__all__";
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const daysBetween = (a: string | Date, b: string | Date) => {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return Math.floor((db.getTime() - da.getTime()) / 86400000);
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "hsl(var(--muted-foreground))",
  em_revisao_interna: "hsl(var(--warning, 38 92% 50%))",
  aprovada_internamente: "hsl(var(--primary))",
  enviada_cliente: "hsl(217 91% 60%)",
  aprovada_cliente: "hsl(142 71% 45%)",
  reprovada_cliente: "hsl(var(--destructive))",
  faturada: "hsl(262 83% 58%)",
  paga: "hsl(160 84% 39%)",
  cancelada: "hsl(var(--destructive))",
};

export default function Dashboard() {
  const snap = useDashboardSnapshot();
  const loading = snap.isLoading;
  const updatedAt = useMemo(() => new Date(snap.updatedAt || Date.now()), [snap.updatedAt]);
  const medicoes = snap.medicoes as Medicao[];
  const contratos = snap.contratos as Contrato[];
  const clientes = snap.clientes as Cliente[];
  const faturas = snap.faturas as Fatura[];
  const load = snap.refetch;

  const hoje = new Date();
  const inicioMesISO = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const fimMesISO = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [filtros, setFiltros] = useState<Filtros>({
    periodoIni: inicioMesISO, periodoFim: fimMesISO, competencia: ALL,
    clienteId: ALL, contratoId: ALL, centroCusto: ALL, fornecedor: ALL, tipoServico: ALL,
    statusMed: ALL, statusFat: ALL,
    apenasAtivas: true, exibirCanceladas: false, exibirVersoes: false,
  });
  const [showAdv, setShowAdv] = useState(false);


  const contratosById = useMemo(() => Object.fromEntries(contratos.map(c => [c.id, c])), [contratos]);
  const clientesById = useMemo(() => Object.fromEntries(clientes.map(c => [c.id, c])), [clientes]);

  // Filtragem base
  const medFiltradas = useMemo(() => {
    return medicoes.filter(m => {
      const ct = contratosById[m.contrato_id];
      if (!ct) return false;
      if (filtros.apenasAtivas && !m.ativa && !filtros.exibirVersoes) return false;
      if (!filtros.exibirCanceladas && m.status === "cancelada") return false;
      if (filtros.competencia !== ALL && m.competencia.slice(0,7) !== filtros.competencia) return false;
      if (filtros.competencia === ALL) {
        if (filtros.periodoIni && m.competencia < filtros.periodoIni) return false;
        if (filtros.periodoFim && m.competencia > filtros.periodoFim) return false;
      }
      if (filtros.clienteId !== ALL && ct.cliente_id !== filtros.clienteId) return false;
      if (filtros.contratoId !== ALL && m.contrato_id !== filtros.contratoId) return false;
      if (filtros.centroCusto !== ALL && (ct.centro_custo ?? "") !== filtros.centroCusto) return false;
      if (filtros.fornecedor !== ALL && (ct.fornecedor_nome ?? "") !== filtros.fornecedor) return false;
      if (filtros.tipoServico !== ALL && ct.tipo_servico !== filtros.tipoServico) return false;
      if (filtros.statusMed !== ALL && m.status !== filtros.statusMed) return false;
      return true;
    });
  }, [medicoes, contratosById, filtros]);

  const medAtivas = useMemo(() => medFiltradas.filter(m => m.ativa && m.status !== "cancelada"), [medFiltradas]);
  const medFiltradasIds = useMemo(() => new Set(medFiltradas.map(m => m.id)), [medFiltradas]);

  const fatFiltradas = useMemo(() => {
    return faturas.filter(f => {
      if (!medFiltradasIds.has(f.medicao_id)) return false;
      if (filtros.statusFat !== ALL && f.status !== filtros.statusFat) return false;
      return true;
    });
  }, [faturas, medFiltradasIds, filtros.statusFat]);

  const fatAtivas = useMemo(() => fatFiltradas.filter(f => f.status !== "cancelado"), [fatFiltradas]);

  // Cards principais
  const contratosAtivosCount = contratos.filter(c => c.status === "ativo").length;
  const medMesCount = medAtivas.length;
  const aprovadasMes = medAtivas.filter(m => m.status === "aprovada_cliente" || m.status === "faturada" || m.status === "paga");
  const aprovadasMesCount = aprovadasMes.length;
  const valorAprovado = aprovadasMes.reduce((s, m) => s + Number(m.valor_final || 0), 0);
  const pendentesAprov = medAtivas.filter(m => ["rascunho","em_revisao_interna","aprovada_internamente","enviada_cliente"].includes(m.status));
  const pendentesAprovCount = pendentesAprov.length;
  const contratosVencendo = contratos.filter(c => c.status === "ativo" && c.termino_contrato && c.termino_contrato >= todayISO() && c.termino_contrato <= addDays(hoje, 30).toISOString().slice(0,10));

  // Cards financeiros
  const valorMedido = medAtivas.reduce((s,m) => s + Number(m.valor_final || 0), 0);

  const fatPorMed = useMemo(() => {
    const map: Record<string, Fatura[]> = {};
    fatAtivas.forEach(f => { (map[f.medicao_id] ??= []).push(f); });
    return map;
  }, [fatAtivas]);

  const aprovSemFatura = aprovadasMes.filter(m => !(fatPorMed[m.id]?.length));
  const valorAFaturar = aprovSemFatura.reduce((s,m) => s + Number(m.valor_final || 0), 0);

  const fatAtivosNaoCancel = faturas.filter(f => f.status !== "cancelado");
  const valorFaturado = fatAtivos => fatAtivos.reduce((s: number, f: Fatura) => s + Number(f.valor || 0), 0);
  const valorFaturadoTotal = valorFaturado(fatAtivas.filter(f => ["nf_emitida","aguardando_pagamento","pago","pago_parcial","em_atraso"].includes(f.status)));
  const valorRecebido = fatAtivas.filter(f => f.status === "pago" || f.status === "pago_parcial")
    .reduce((s,f) => s + Number(f.valor_recebido || 0), 0);
  const valorEmAberto = fatAtivas.filter(f => f.status !== "pago")
    .reduce((s,f) => s + Math.max(0, Number(f.valor || 0) - Number(f.valor_recebido || 0)), 0);
  const valorEmAtraso = fatAtivas.filter(f => f.status !== "pago" && f.data_vencimento && f.data_vencimento < todayISO())
    .reduce((s,f) => s + Math.max(0, Number(f.valor || 0) - Number(f.valor_recebido || 0)), 0);

  // Operacionais
  const equipamentosMedidos = (() => {
    // contar a partir de medicao_itens não foi carregado; aproximar via horas
    return medAtivas.length;
  })();
  const totalHorasInf = medAtivas.reduce((s,m) => s + Number(m.total_horas_informadas || 0), 0);
  const totalHorasLiq = medAtivas.reduce((s,m) => s + Number(m.total_horas_liquidas || 0), 0);
  const totalHorasPagar = medAtivas.reduce((s,m) => s + Number(m.total_horas_pagar || 0), 0);
  const totalDesc = medAtivas.reduce((s,m) => s + Number(m.valor_descontos || 0), 0);
  const totalComp = medAtivas.reduce((s,m) => s + Number(m.valor_complementares || 0), 0);

  // Séries mensais (últimos 12 competências relativas ao filtro fim)
  const serieMensal = useMemo(() => {
    const map: Record<string, { mes: string; medido: number; aprovado: number; faturado: number; recebido: number; aberto: number }> = {};
    const refFim = filtros.periodoFim ? new Date(filtros.periodoFim) : hoje;
    for (let i = 11; i >= 0; i--) {
      const d = new Date(refFim.getFullYear(), refFim.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      map[k] = { mes: k, medido: 0, aprovado: 0, faturado: 0, recebido: 0, aberto: 0 };
    }
    medicoes.forEach(m => {
      if (!m.ativa || m.status === "cancelada") return;
      const k = m.competencia.slice(0,7);
      if (!(k in map)) return;
      map[k].medido += Number(m.valor_final || 0);
      if (["aprovada_cliente","faturada","paga"].includes(m.status)) map[k].aprovado += Number(m.valor_final || 0);
    });
    faturas.forEach(f => {
      if (f.status === "cancelado" || !f.data_emissao) return;
      const k = f.data_emissao.slice(0,7);
      if (!(k in map)) return;
      map[k].faturado += Number(f.valor || 0);
      if (f.status === "pago" || f.status === "pago_parcial") map[k].recebido += Number(f.valor_recebido || 0);
      if (f.status !== "pago") map[k].aberto += Math.max(0, Number(f.valor || 0) - Number(f.valor_recebido || 0));
    });
    return Object.values(map);
  }, [medicoes, faturas, filtros.periodoFim]);

  // Medições por status
  const medPorStatus = useMemo(() => {
    const map: Record<string, number> = {};
    medFiltradas.filter(m => m.ativa).forEach(m => { map[m.status] = (map[m.status] || 0) + 1; });
    return Object.entries(map).map(([status, qtd]) => ({ status, label: labelStatus(status), qtd, fill: STATUS_COLORS[status] || "hsl(var(--primary))" }));
  }, [medFiltradas]);

  // Top rankings
  const topClientes = useMemo(() => {
    const agg: Record<string, { id: string; nome: string; valor: number }> = {};
    medAtivas.forEach(m => {
      const ct = contratosById[m.contrato_id]; if (!ct) return;
      const cl = clientesById[ct.cliente_id]; if (!cl) return;
      agg[cl.id] = agg[cl.id] || { id: cl.id, nome: cl.nome_fantasia || cl.razao_social, valor: 0 };
      agg[cl.id].valor += Number(m.valor_final || 0);
    });
    return Object.values(agg).sort((a,b) => b.valor - a.valor).slice(0,5);
  }, [medAtivas, contratosById, clientesById]);

  const topContratos = useMemo(() => {
    const agg: Record<string, { numero: string; valor: number }> = {};
    medAtivas.forEach(m => {
      const ct = contratosById[m.contrato_id]; if (!ct) return;
      agg[ct.numero_dj] = agg[ct.numero_dj] || { numero: ct.numero_dj, valor: 0 };
      agg[ct.numero_dj].valor += Number(m.valor_final || 0);
    });
    return Object.values(agg).sort((a,b) => b.valor - a.valor).slice(0,5);
  }, [medAtivas, contratosById]);

  const topContratosHoras = useMemo(() => {
    const agg: Record<string, { numero: string; horas: number }> = {};
    medAtivas.forEach(m => {
      const ct = contratosById[m.contrato_id]; if (!ct) return;
      agg[ct.numero_dj] = agg[ct.numero_dj] || { numero: ct.numero_dj, horas: 0 };
      agg[ct.numero_dj].horas += Number(m.total_horas_pagar || 0);
    });
    return Object.values(agg).sort((a,b) => b.horas - a.horas).slice(0,5);
  }, [medAtivas, contratosById]);

  const abertoPorCliente = useMemo(() => {
    const agg: Record<string, { nome: string; valor: number }> = {};
    fatAtivas.filter(f => f.status !== "pago").forEach(f => {
      const m = medicoes.find(x => x.id === f.medicao_id); if (!m) return;
      const ct = contratosById[m.contrato_id]; if (!ct) return;
      const cl = clientesById[ct.cliente_id]; if (!cl) return;
      const aberto = Math.max(0, Number(f.valor || 0) - Number(f.valor_recebido || 0));
      agg[cl.id] = agg[cl.id] || { nome: cl.nome_fantasia || cl.razao_social, valor: 0 };
      agg[cl.id].valor += aberto;
    });
    return Object.values(agg).sort((a,b) => b.valor - a.valor).slice(0,5);
  }, [fatAtivas, medicoes, contratosById, clientesById]);

  // Tabelas
  const linhaCliente = (m: Medicao) => {
    const ct = contratosById[m.contrato_id];
    const cl = ct ? clientesById[ct.cliente_id] : undefined;
    return { ct, cl, nomeCliente: cl?.nome_fantasia || cl?.razao_social || "—", numeroContrato: ct?.numero_dj || "—" };
  };

  const tablePendentes = pendentesAprov.map(m => {
    const { nomeCliente, numeroContrato, ct } = linhaCliente(m);
    return { ...m, nomeCliente, numeroContrato, centro: ct?.centro_custo || "—", dias: daysBetween(m.updated_at || m.created_at, new Date()) };
  });

  const tableAprovadasSemFat = aprovSemFatura.map(m => {
    const { nomeCliente, numeroContrato } = linhaCliente(m);
    return { ...m, nomeCliente, numeroContrato, dias: m.aprovada_cliente_em ? daysBetween(m.aprovada_cliente_em, new Date()) : null };
  });

  const tableFatAberto = fatAtivas.filter(f => f.status !== "pago").map(f => {
    const m = medicoes.find(x => x.id === f.medicao_id);
    const ct = m ? contratosById[m.contrato_id] : undefined;
    const cl = ct ? clientesById[ct.cliente_id] : undefined;
    const saldo = Number(f.valor || 0) - Number(f.valor_recebido || 0);
    const diasV = f.data_vencimento ? daysBetween(new Date(), f.data_vencimento) : null;
    return { f, m, nomeCliente: cl?.nome_fantasia || cl?.razao_social || "—", numeroContrato: ct?.numero_dj || "—", saldo, diasV };
  });

  const tableFatAtraso = tableFatAberto.filter(r => r.diasV !== null && r.diasV < 0);

  const tableContratosVenc = contratosVencendo.map(c => {
    const cl = clientesById[c.cliente_id];
    const valor = medAtivas.filter(m => m.contrato_id === c.id).reduce((s,m) => s + Number(m.valor_final || 0), 0);
    const diasV = c.termino_contrato ? daysBetween(new Date(), c.termino_contrato) : null;
    return { c, cl, valor, diasV };
  });

  const versionsByOrig = useMemo(() => {
    const map: Record<string, Medicao[]> = {};
    medicoes.forEach(m => {
      const k = m.medicao_original_id || m.id;
      (map[k] ??= []).push(m);
    });
    return Object.values(map).filter(arr => arr.length > 1);
  }, [medicoes]);

  const tableVersoes = versionsByOrig.map(arr => {
    arr.sort((a,b) => b.versao - a.versao);
    const ativa = arr.find(x => x.ativa) || arr[0];
    const anterior = arr.find(x => x !== ativa);
    const { nomeCliente, numeroContrato } = linhaCliente(ativa);
    return {
      id: ativa.id, nomeCliente, numeroContrato, competencia: ativa.competencia,
      versaoAtiva: ativa.versao, qtd: arr.length,
      valorAtual: Number(ativa.valor_final || 0),
      valorAnterior: anterior ? Number(anterior.valor_final || 0) : 0,
      diff: Number(ativa.valor_final || 0) - Number(anterior?.valor_final || 0),
      motivo: ativa.motivo_reimportacao || "—",
    };
  }).slice(0, 50);

  // Insights
  const insights: { tipo: "warn"|"info"|"danger"; texto: string }[] = [];
  const paradas5d = medAtivas.filter(m => m.status === "rascunho" && daysBetween(m.updated_at, new Date()) > 5);
  if (paradas5d.length) insights.push({ tipo: "warn", texto: `${paradas5d.length} medição(ões) há mais de 5 dias em Rascunho.` });
  const enviadas3d = medAtivas.filter(m => m.status === "enviada_cliente" && daysBetween(m.updated_at, new Date()) > 3);
  if (enviadas3d.length) insights.push({ tipo: "warn", texto: `${enviadas3d.length} medição(ões) há mais de 3 dias aguardando aprovação do cliente.` });
  if (aprovSemFatura.length) insights.push({ tipo: "info", texto: `${aprovSemFatura.length} medições aprovadas pelo cliente ainda não faturadas, totalizando ${fmtBRL(valorAFaturar)}.` });
  const venc7 = fatAtivas.filter(f => f.status !== "pago" && f.data_vencimento && f.data_vencimento >= todayISO() && f.data_vencimento <= addDays(hoje,7).toISOString().slice(0,10));
  if (venc7.length) insights.push({ tipo: "warn", texto: `${venc7.length} faturamentos vencendo em 7 dias, totalizando ${fmtBRL(venc7.reduce((s,f) => s + Number(f.valor || 0) - Number(f.valor_recebido || 0), 0))}.` });
  if (tableFatAtraso.length) insights.push({ tipo: "danger", texto: `${tableFatAtraso.length} faturamentos em atraso, totalizando ${fmtBRL(tableFatAtraso.reduce((s,r) => s + r.saldo, 0))}.` });
  if (contratosVencendo.length) insights.push({ tipo: "warn", texto: `${contratosVencendo.length} contratos vencendo nos próximos 30 dias.` });
  versionsByOrig.forEach(arr => {
    arr.sort((a,b) => b.versao - a.versao);
    const ativa = arr.find(x => x.ativa); const ant = arr.find(x => x !== ativa);
    if (ativa && ant) {
      const diff = Number(ativa.valor_final||0) - Number(ant.valor_final||0);
      if (Math.abs(diff) > 1000) {
        const { numeroContrato } = linhaCliente(ativa);
        insights.push({ tipo: "info", texto: `Contrato ${numeroContrato}: reimportação com diferença de ${fmtBRL(diff)}.` });
      }
    }
  });
  if (valorMedido > 0) {
    topClientes.slice(0,1).forEach(c => {
      const pct = (c.valor / valorMedido) * 100;
      if (pct > 30) insights.push({ tipo: "info", texto: `O cliente ${c.nome} representa ${pct.toFixed(2)}% do valor medido no período.` });
    });
  }
  contratos.filter(c => c.status === "ativo").forEach(c => {
    const tem = medAtivas.some(m => m.contrato_id === c.id);
    if (!tem) insights.push({ tipo: "info", texto: `Contrato ${c.numero_dj} ativo sem medição no período selecionado.` });
  });
  const cancelTot = medicoes.filter(m => m.status === "cancelada").reduce((s,m) => s + Number(m.valor_final||0), 0);
  if (cancelTot > 0) insights.push({ tipo: "info", texto: `Medições canceladas (histórico): ${fmtBRL(cancelTot)}.` });

  // Qualidade dos dados
  const qd = {
    medSemFornecedor: medAtivas.filter(m => !contratosById[m.contrato_id]?.fornecedor_nome).length,
    clientesIncompletos: clientes.filter(c => !c.cnpj || !c.endereco || !c.cidade || !c.uf).length,
    contratosSemVigencia: contratos.filter(c => !c.inicio_operacao || !c.termino_contrato).length,
    versoesConflito: versionsByOrig.filter(arr => arr.filter(x => x.ativa).length !== 1).length,
    fatSemVencimento: faturas.filter(f => f.status !== "cancelado" && !f.data_vencimento).length,
    fatCancelados: faturas.filter(f => f.status === "cancelado").length,
    fatCanceladosValor: faturas.filter(f => f.status === "cancelado").reduce((s,f) => s + Number(f.valor||0), 0),
  };

  // Filtro options
  const competenciasUnicas = Array.from(new Set(medicoes.map(m => m.competencia.slice(0,7)))).sort().reverse();
  const centrosUnicos = Array.from(new Set(contratos.map(c => c.centro_custo).filter(Boolean))) as string[];
  const fornecedoresUnicos = Array.from(new Set(contratos.map(c => c.fornecedor_nome).filter(Boolean))) as string[];
  const tiposUnicos = Array.from(new Set(contratos.map(c => c.tipo_servico))).filter(Boolean);

  const limparFiltros = () => setFiltros({
    periodoIni: inicioMesISO, periodoFim: fimMesISO, competencia: ALL,
    clienteId: ALL, contratoId: ALL, centroCusto: ALL, fornecedor: ALL, tipoServico: ALL,
    statusMed: ALL, statusFat: ALL,
    apenasAtivas: true, exibirCanceladas: false, exibirVersoes: false,
  });

  const STATUS_MED_OPTS: MedicaoStatus[] = ["rascunho","em_revisao_interna","aprovada_internamente","enviada_cliente","aprovada_cliente","reprovada_cliente","faturada","paga","cancelada"];
  const STATUS_FAT_OPTS: FaturamentoStatus[] = ["a_faturar","nf_emitida","aguardando_pagamento","pago","pago_parcial","em_atraso","cancelado"];

  return (
    <div className="space-y-6">
      {/* Cabeçalho executivo */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <PageHeader title="Dashboard Gerencial" description="Visão executiva de medições, contratos e faturamento" />
          <p className="max-w-3xl text-sm text-muted-foreground">
            No período selecionado, existem <strong className="text-foreground">{medAtivas.length}</strong> medições ativas,{" "}
            <strong className="text-foreground">{fmtBRL(valorMedido)}</strong> medidos,{" "}
            <strong className="text-foreground">{fmtBRL(valorAprovado)}</strong> aprovados e{" "}
            <strong className="text-foreground">{fmtBRL(valorAFaturar)}</strong> pendentes de faturamento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">Atualizado em {updatedAt.toLocaleString("pt-BR")}</span>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" variant={showAdv ? "default" : "outline"} onClick={() => setShowAdv(v => !v)}>
            <FilterIcon className="mr-2 h-3.5 w-3.5" /> Filtros avançados
          </Button>
        </div>
      </div>

      {/* Cards executivos principais */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <HeroKpi icon={Wallet} label="Valor medido" value={fmtBRL(valorMedido)} desc="Total medido no período filtrado" tone="primary" />
        <HeroKpi icon={CheckCircle2} label="Valor aprovado" value={fmtBRL(valorAprovado)} desc="Medições aprovadas pelo cliente" tone="success" to="/medicoes" />
        <HeroKpi icon={Hourglass} label="A faturar" value={fmtBRL(valorAFaturar)} desc="Aprovadas ainda sem faturamento" tone="warning" to="/faturamento" />
        <HeroKpi icon={BadgeDollarSign} label="Em aberto" value={fmtBRL(valorEmAberto)} desc="Saldo financeiro a receber" tone="info" to="/faturamento" />
        <HeroKpi icon={AlertCircle} label="Em atraso" value={fmtBRL(valorEmAtraso)} desc="Valores vencidos e não pagos" tone="danger" to="/faturamento" />
      </div>

      {/* Cards operacionais secundários */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={FileText} label="Contratos ativos" value={String(contratosAtivosCount)} to="/contratos" />
        <KpiCard icon={ClipboardList} label="Medições no período" value={String(medMesCount)} to="/medicoes" />
        <KpiCard icon={CheckCircle2} label="Aprovadas no período" value={String(aprovadasMesCount)} accent="success" to="/medicoes" />
        <KpiCard icon={AlertTriangle} label="Pendentes de aprovação" value={String(pendentesAprovCount)} accent="warning" to="/medicoes" />
        <KpiCard icon={TrendingUp} label="Contratos vencendo (30d)" value={String(contratosVencendo.length)} accent="warning" to="/contratos" />
        <KpiCard icon={X} label="Medições canceladas" value={String(medicoes.filter(m => m.status === "cancelada").length)} accent="danger" to="/medicoes" />
      </div>

      {/* Filtros compactos e agrupados */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><FilterIcon className="h-4 w-4" /> Filtros</CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAdv(v => !v)}>
                {showAdv ? "Ocultar avançados" : "Filtros avançados"}
              </Button>
              <Button variant="outline" size="sm" onClick={limparFiltros}><X className="mr-2 h-3.5 w-3.5" /> Limpar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div><Label className="text-xs">Período inicial</Label><Input type="date" value={filtros.periodoIni} onChange={e => setFiltros({ ...filtros, periodoIni: e.target.value })} /></div>
              <div><Label className="text-xs">Período final</Label><Input type="date" value={filtros.periodoFim} onChange={e => setFiltros({ ...filtros, periodoFim: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Competência</Label>
                <Select value={filtros.competencia} onValueChange={v => setFiltros({ ...filtros, competencia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{competenciasUnicas.map(c => <SelectItem key={c} value={c}>{fmtCompetencia(c)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente e contrato</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Cliente</Label>
                <Select value={filtros.clienteId} onValueChange={v => setFiltros({ ...filtros, clienteId: v, contratoId: ALL })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Contrato</Label>
                <Select value={filtros.contratoId} onValueChange={v => setFiltros({ ...filtros, contratoId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{contratos.filter(c => filtros.clienteId === ALL || c.cliente_id === filtros.clienteId).map(c => <SelectItem key={c.id} value={c.id}>{c.numero_dj}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status medição</Label>
                <Select value={filtros.statusMed} onValueChange={v => setFiltros({ ...filtros, statusMed: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{STATUS_MED_OPTS.map(s => <SelectItem key={s} value={s}>{labelStatus(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {showAdv && (
            <div className="space-y-4 border-t pt-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operação e fiscal</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label className="text-xs">Centro de custo</Label>
                    <Select value={filtros.centroCusto} onValueChange={v => setFiltros({ ...filtros, centroCusto: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{centrosUnicos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Fornecedor / Locadora</Label>
                    <Select value={filtros.fornecedor} onValueChange={v => setFiltros({ ...filtros, fornecedor: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{fornecedoresUnicos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Tipo de serviço</Label>
                    <Select value={filtros.tipoServico} onValueChange={v => setFiltros({ ...filtros, tipoServico: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{tiposUnicos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Status faturamento</Label>
                    <Select value={filtros.statusFat} onValueChange={v => setFiltros({ ...filtros, statusFat: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{STATUS_FAT_OPTS.map(s => <SelectItem key={s} value={s}>{labelFatStatus(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exibição</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"><Label className="text-xs">Apenas medições ativas</Label><Switch checked={filtros.apenasAtivas} onCheckedChange={v => setFiltros({ ...filtros, apenasAtivas: v })} /></div>
                  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"><Label className="text-xs">Exibir canceladas</Label><Switch checked={filtros.exibirCanceladas} onCheckedChange={v => setFiltros({ ...filtros, exibirCanceladas: v })} /></div>
                  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"><Label className="text-xs">Exibir versões anteriores</Label><Switch checked={filtros.exibirVersoes} onCheckedChange={v => setFiltros({ ...filtros, exibirVersoes: v })} /></div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Indicadores operacionais */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Indicadores operacionais</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard icon={Receipt} label="Faturado" value={fmtBRL(valorFaturadoTotal)} accent="primary" to="/faturamento" />
          <KpiCard icon={Banknote} label="Recebido" value={fmtBRL(valorRecebido)} accent="success" to="/faturamento" />
          <KpiCard icon={Activity} label="Horas informadas" value={`${fmtNum(totalHorasInf)} h`} />
          <KpiCard icon={Activity} label="Horas líquidas" value={`${fmtNum(totalHorasLiq)} h`} />
          <KpiCard icon={Clock} label="Horas a pagar" value={`${fmtNum(totalHorasPagar)} h`} accent="primary" />
          <KpiCard icon={TrendingUp} label="Complementares" value={fmtBRL(totalComp)} accent="success" />
        </div>
      </div>


      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Evolução mensal — Medido x Aprovado</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serieMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" fontSize={11} tickFormatter={(v) => fmtCompetencia(v).slice(0,3) + "/" + v.slice(2,4)} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(l) => fmtCompetencia(l as string)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="medido" name="Medido" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                <Bar dataKey="aprovado" name="Aprovado" fill="hsl(142 71% 45%)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Evolução de Faturamento</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" fontSize={11} tickFormatter={(v) => fmtCompetencia(v).slice(0,3) + "/" + v.slice(2,4)} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(l) => fmtCompetencia(l as string)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="faturado" name="Faturado" stroke="hsl(262 83% 58%)" strokeWidth={2} />
                <Line type="monotone" dataKey="recebido" name="Recebido" stroke="hsl(142 71% 45%)" strokeWidth={2} />
                <Line type="monotone" dataKey="aberto" name="Em aberto" stroke="hsl(38 92% 50%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Medições por status</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={medPorStatus} dataKey="qtd" nameKey="label" innerRadius={50} outerRadius={90} label={(e) => `${e.label}: ${e.qtd}`}>
                  {medPorStatus.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 5 clientes por valor medido</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-2">
            {topClientes.length ? topClientes.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0"><Badge variant="secondary">{i+1}</Badge><span className="truncate text-sm font-medium">{c.nome}</span></div>
                <span className="text-sm font-semibold num text-primary">{fmtBRL(c.valor)}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">Sem dados.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 5 contratos por valor medido</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-2">
            {topContratos.length ? topContratos.map((c, i) => (
              <div key={c.numero} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0"><Badge variant="secondary">{i+1}</Badge><span className="truncate text-sm font-medium">{c.numero}</span></div>
                <span className="text-sm font-semibold num text-primary">{fmtBRL(c.valor)}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">Sem dados.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 5 contratos por horas a pagar</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-2">
            {topContratosHoras.length ? topContratosHoras.map((c, i) => (
              <div key={c.numero} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0"><Badge variant="secondary">{i+1}</Badge><span className="truncate text-sm font-medium">{c.numero}</span></div>
                <span className="text-sm font-semibold num">{fmtNum(c.horas)} h</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">Sem dados.</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Valores em aberto por cliente</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={abertoPorCliente} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="nome" fontSize={11} width={140} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="valor" fill="hsl(38 92% 50%)" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      <Card>
        <CardHeader><CardTitle className="text-base">Insights e Alertas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {insights.length ? insights.map((i, idx) => (
            <div key={idx} className={`flex items-start gap-2 rounded-md border p-3 text-sm ${i.tipo === "danger" ? "border-destructive/40 bg-destructive/5" : i.tipo === "warn" ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/20"}`}>
              <AlertCircle className={`h-4 w-4 mt-0.5 ${i.tipo === "danger" ? "text-destructive" : i.tipo === "warn" ? "text-amber-600" : "text-muted-foreground"}`} />
              <span>{i.texto}</span>
            </div>
          )) : <p className="text-sm text-muted-foreground">Nenhum alerta no período.</p>}
        </CardContent>
      </Card>

      {/* Tabelas gerenciais */}
      <Card>
        <CardHeader><CardTitle className="text-base">Tabelas gerenciais</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="pendentes">
            <TabsList className="flex-wrap">
              <TabsTrigger value="pendentes">Pendentes ({tablePendentes.length})</TabsTrigger>
              <TabsTrigger value="aprovadas">Aprovadas s/ faturar ({tableAprovadasSemFat.length})</TabsTrigger>
              <TabsTrigger value="aberto">Faturas em aberto ({tableFatAberto.length})</TabsTrigger>
              <TabsTrigger value="atraso">Em atraso ({tableFatAtraso.length})</TabsTrigger>
              <TabsTrigger value="contratos">Contratos vencendo ({tableContratosVenc.length})</TabsTrigger>
              <TabsTrigger value="versoes">Versões ({tableVersoes.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="pendentes">
              <SimpleTable headers={["Cliente","Contrato","Centro","Competência","Valor","Status","Dias","Ação"]}>
                {tablePendentes.slice(0, 50).map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.nomeCliente}</TableCell><TableCell>{r.numeroContrato}</TableCell>
                    <TableCell>{r.centro}</TableCell><TableCell>{fmtCompetencia(r.competencia)}</TableCell>
                    <TableCell className="num">{fmtBRL(r.valor_final)}</TableCell>
                    <TableCell><Badge variant="outline">{labelStatus(r.status)}</Badge></TableCell>
                    <TableCell>{r.dias}</TableCell>
                    <TableCell><Link to={`/medicoes/${r.id}`} className="text-primary underline">Abrir</Link></TableCell>
                  </TableRow>
                ))}
              </SimpleTable>
            </TabsContent>

            <TabsContent value="aprovadas">
              <SimpleTable headers={["Cliente","Contrato","Competência","Valor","Aprovação","Dias","Ação"]}>
                {tableAprovadasSemFat.slice(0, 50).map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.nomeCliente}</TableCell><TableCell>{r.numeroContrato}</TableCell>
                    <TableCell>{fmtCompetencia(r.competencia)}</TableCell>
                    <TableCell className="num">{fmtBRL(r.valor_final)}</TableCell>
                    <TableCell>{fmtDate(r.aprovada_cliente_em)}</TableCell>
                    <TableCell>{r.dias ?? "—"}</TableCell>
                    <TableCell><Link to={`/medicoes/${r.id}`} className="text-primary underline">Faturar</Link></TableCell>
                  </TableRow>
                ))}
              </SimpleTable>
            </TabsContent>

            <TabsContent value="aberto">
              <SimpleTable headers={["Cliente","Contrato","NF","Vencimento","Dias","Status","Saldo","Ação"]}>
                {tableFatAberto.slice(0, 80).map(r => (
                  <TableRow key={r.f.id}>
                    <TableCell>{r.nomeCliente}</TableCell><TableCell>{r.numeroContrato}</TableCell>
                    <TableCell>{r.f.numero_nf || "—"}</TableCell>
                    <TableCell>{fmtDate(r.f.data_vencimento)}</TableCell>
                    <TableCell className={r.diasV !== null && r.diasV < 0 ? "text-destructive" : ""}>{r.diasV ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{labelFatStatus(r.f.status)}</Badge></TableCell>
                    <TableCell className="num">{fmtBRL(r.saldo)}</TableCell>
                    <TableCell><Link to={`/faturamento/${r.f.id}`} className="text-primary underline">Abrir</Link></TableCell>
                  </TableRow>
                ))}
              </SimpleTable>
            </TabsContent>

            <TabsContent value="atraso">
              <SimpleTable headers={["Cliente","Contrato","NF","Vencimento","Dias atraso","Status","Saldo","Ação"]}>
                {tableFatAtraso.slice(0, 80).map(r => (
                  <TableRow key={r.f.id}>
                    <TableCell>{r.nomeCliente}</TableCell><TableCell>{r.numeroContrato}</TableCell>
                    <TableCell>{r.f.numero_nf || "—"}</TableCell>
                    <TableCell>{fmtDate(r.f.data_vencimento)}</TableCell>
                    <TableCell className="text-destructive font-medium">{r.diasV !== null ? Math.abs(r.diasV) : "—"}</TableCell>
                    <TableCell><Badge variant="destructive">{labelFatStatus(r.f.status)}</Badge></TableCell>
                    <TableCell className="num">{fmtBRL(r.saldo)}</TableCell>
                    <TableCell><Link to={`/faturamento/${r.f.id}`} className="text-primary underline">Abrir</Link></TableCell>
                  </TableRow>
                ))}
              </SimpleTable>
            </TabsContent>

            <TabsContent value="contratos">
              <SimpleTable headers={["Cliente","Contrato","Centro","Tipo","Início","Fim","Dias","Valor medido","Ação"]}>
                {tableContratosVenc.map(r => (
                  <TableRow key={r.c.id}>
                    <TableCell>{r.cl?.nome_fantasia || r.cl?.razao_social || "—"}</TableCell>
                    <TableCell>{r.c.numero_dj}</TableCell>
                    <TableCell>{r.c.centro_custo || "—"}</TableCell>
                    <TableCell>{r.c.tipo_servico}</TableCell>
                    <TableCell>{fmtDate(r.c.inicio_operacao)}</TableCell>
                    <TableCell>{fmtDate(r.c.termino_contrato)}</TableCell>
                    <TableCell className={r.diasV !== null && r.diasV <= 7 ? "text-destructive font-medium" : ""}>{r.diasV ?? "—"}</TableCell>
                    <TableCell className="num">{fmtBRL(r.valor)}</TableCell>
                    <TableCell><Link to={`/contratos/${r.c.id}`} className="text-primary underline">Abrir</Link></TableCell>
                  </TableRow>
                ))}
              </SimpleTable>
            </TabsContent>

            <TabsContent value="versoes">
              <SimpleTable headers={["Cliente","Contrato","Competência","V. ativa","Qtd","Atual","Anterior","Diferença","Motivo","Ação"]}>
                {tableVersoes.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.nomeCliente}</TableCell><TableCell>{r.numeroContrato}</TableCell>
                    <TableCell>{fmtCompetencia(r.competencia)}</TableCell>
                    <TableCell>v{r.versaoAtiva}</TableCell><TableCell>{r.qtd}</TableCell>
                    <TableCell className="num">{fmtBRL(r.valorAtual)}</TableCell>
                    <TableCell className="num">{fmtBRL(r.valorAnterior)}</TableCell>
                    <TableCell className={`num ${r.diff < 0 ? "text-destructive" : "text-success"}`}>{fmtBRL(r.diff)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.motivo}</TableCell>
                    <TableCell><Link to={`/medicoes/${r.id}`} className="text-primary underline">Comparar</Link></TableCell>
                  </TableRow>
                ))}
              </SimpleTable>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Qualidade dos dados */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> Qualidade dos dados</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard icon={AlertTriangle} label="Medições s/ fornecedor" value={String(qd.medSemFornecedor)} accent="warning" />
            <KpiCard icon={AlertTriangle} label="Clientes incompletos" value={String(qd.clientesIncompletos)} accent="warning" to="/clientes" />
            <KpiCard icon={AlertTriangle} label="Contratos s/ vigência" value={String(qd.contratosSemVigencia)} accent="warning" to="/contratos" />
            <KpiCard icon={AlertTriangle} label="Conflito de versão" value={String(qd.versoesConflito)} accent="danger" />
            <KpiCard icon={AlertTriangle} label="Faturas s/ vencimento" value={String(qd.fatSemVencimento)} accent="warning" to="/faturamento" />
            <KpiCard icon={AlertCircle} label="Faturamentos cancelados" value={`${qd.fatCancelados} • ${fmtBRL(qd.fatCanceladosValor)}`} accent="danger" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent, to }: { icon: any; label: string; value: string; accent?: "primary"|"success"|"warning"|"danger"; to?: string }) {
  const color = accent === "success" ? "text-success" : accent === "warning" ? "text-amber-600" : accent === "danger" ? "text-destructive" : accent === "primary" ? "text-primary" : "text-foreground";
  const inner = (
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <p className={`mt-2 text-xl font-bold num ${color}`}>{value}</p>
    </CardContent>
  );
  return to ? (
    <Link to={to}><Card className="transition hover:shadow-md hover:border-primary/40 cursor-pointer h-full">{inner}</Card></Link>
  ) : (
    <Card>{inner}</Card>
  );
}

function SimpleTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader><TableRow>{headers.map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

function HeroKpi({
  icon: Icon, label, value, desc, tone, to,
}: {
  icon: any; label: string; value: string; desc: string;
  tone: "primary" | "success" | "warning" | "danger" | "info"; to?: string;
}) {
  const toneMap: Record<string, { ring: string; bg: string; icon: string; value: string }> = {
    primary: { ring: "border-primary/30", bg: "bg-primary/5", icon: "text-primary bg-primary/10", value: "text-foreground" },
    success: { ring: "border-emerald-500/30", bg: "bg-emerald-500/5", icon: "text-emerald-600 bg-emerald-500/10", value: "text-emerald-700 dark:text-emerald-400" },
    warning: { ring: "border-amber-500/30", bg: "bg-amber-500/5", icon: "text-amber-600 bg-amber-500/10", value: "text-amber-700 dark:text-amber-400" },
    danger:  { ring: "border-destructive/30", bg: "bg-destructive/5", icon: "text-destructive bg-destructive/10", value: "text-destructive" },
    info:    { ring: "border-sky-500/30", bg: "bg-sky-500/5", icon: "text-sky-600 bg-sky-500/10", value: "text-sky-700 dark:text-sky-400" },
  };
  const t = toneMap[tone];
  const inner = (
    <Card className={`h-full border ${t.ring} ${t.bg} transition hover:shadow-md ${to ? "cursor-pointer" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`mt-2 truncate text-2xl font-bold num ${t.value}`}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

