import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtNum, fmtDate, fmtCompetencia } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao_interna: "Em revisão interna",
  aprovada_internamente: "Aprovada internamente",
  enviada_cliente: "Enviada ao cliente",
  aprovada_cliente: "Aprovada pelo cliente",
  reprovada_cliente: "Reprovada pelo cliente",
  importada: "Importada",
  revisao_tecnica: "Em revisão técnica",
  aprovacao_gerencial: "Em aprovação gerencial",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  faturada: "Faturada",
  paga: "Paga",
  cancelada: "Cancelada",
};

const FORNECEDOR_PADRAO_NOME = "MC TERRAPLENAGEM E CONSTRUÇÕES LTDA";
const FORNECEDOR_PADRAO_CODIGO = "15811";

const FIELD_LABEL: Record<string, string> = {
  horimetro_inicial: "Horímetro inicial",
  horimetro_final: "Horímetro final",
  horas_informadas: "HT informado",
  horas_mecanicas: "Horas mecânicas",
  horas_chuvoso: "Período chuvoso",
  horas_excecao_chuvoso: "Exceção chuvoso",
  valor_complementares: "Complementares",
  valor_descontos: "Descontos",
  observacoes: "Observações",
  valor_final: "Valor final",
  garantia_proporcional: "Garantia proporcional",
  data_inicio_operacao_item: "Início operação",
  data_fim_operacao_item: "Fim operação",
};

// Campos relevantes para o PDF do cliente (afetam cálculo, valor, horas, regras ou período)
const CAMPOS_RELEVANTES_CLIENTE = new Set([
  "horas_informadas",
  "horas_mecanicas",
  "horas_chuvoso",
  "horas_excecao_chuvoso",
  "valor_complementares",
  "valor_descontos",
  "valor_final",
  "horas_a_pagar",
  "horas_liquidas",
  "garantia_proporcional",
  "data_inicio_operacao_item",
  "data_fim_operacao_item",
]);

const REGRA_TIPO_LABEL: Record<string, string> = {
  valor_hora: "Valor/hora contratado",
  garantia_minima: "Garantia mínima mensal",
  garantia_proporcional: "Garantia proporcional por período parcial",
  desconto_horas_mecanicas: "Desconto de horas mecânicas",
  periodo_chuvoso: "Regra de período chuvoso",
  excecao_chuvoso: "Exceção do período chuvoso",
  desconto_manual: "Desconto manual",
  complementar: "Valor complementar",
  regra_personalizada: "Regra personalizada",
};

const REGRA_ORIGEM_LABEL: Record<string, string> = {
  contrato: "Geral do contrato",
  tipo_equipamento: "Por tipo de equipamento",
  equipamento: "Específica do equipamento",
  automatica: "Regra automática do sistema",
};

function labelTipoRegra(t?: string) {
  if (!t) return "-";
  return REGRA_TIPO_LABEL[t] ?? t.replace(/_/g, " ");
}
function labelOrigemRegra(o?: string) {
  if (!o) return "-";
  return REGRA_ORIGEM_LABEL[o] ?? o;
}

// Tenta detectar se um valor "anterior" e "novo" são numericamente equivalentes
function valoresEquivalentes(a: any, b: any): boolean {
  if (a == null && b == null) return true;
  const sa = String(a ?? "").trim();
  const sb = String(b ?? "").trim();
  if (sa === sb) return true;
  const na = Number(sa.replace(",", "."));
  const nb = Number(sb.replace(",", "."));
  if (!isNaN(na) && !isNaN(nb)) {
    return Math.abs(na - nb) < 0.005;
  }
  return false;
}

// Campos monetários (formatar como BRL no histórico)
const CAMPOS_MONETARIOS = new Set([
  "valor_final", "valor_complementares", "valor_descontos", "valor_bruto", "valor_hora",
]);
// Campos numéricos de horas (formatar como número decimal)
const CAMPOS_HORAS = new Set([
  "horas_informadas", "horas_mecanicas", "horas_chuvoso", "horas_excecao_chuvoso",
  "horas_a_pagar", "horas_liquidas", "garantia_proporcional", "garantia_mensal_horas",
  "horimetro_inicial", "horimetro_final",
]);
// Campos de data
const CAMPOS_DATA = new Set([
  "data_inicio_operacao_item", "data_fim_operacao_item", "periodo_inicio", "periodo_fim",
]);

function formatValorHistorico(campo: string | null | undefined, valor: any): string {
  if (valor == null || valor === "") return "-";
  const s = String(valor).trim();
  if (!campo) return s;
  if (CAMPOS_MONETARIOS.has(campo)) {
    const n = Number(s.replace(",", "."));
    if (!isNaN(n)) return fmtBRL(n);
  }
  if (CAMPOS_HORAS.has(campo)) {
    const n = Number(s.replace(",", "."));
    if (!isNaN(n)) return fmtNum(n);
  }
  if (CAMPOS_DATA.has(campo)) {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return fmtDate(s);
  }
  // Fallback: se parece um número longo com muitas casas, arredonda
  const n = Number(s.replace(",", "."));
  if (!isNaN(n) && /\.\d{3,}/.test(s)) return fmtNum(n);
  return s;
}

interface GenerarOpts {
  preview?: boolean;
  /** "interno" exibe histórico completo; "cliente" filtra alterações irrelevantes. */
  modo?: "interno" | "cliente";
}


export async function gerarBoletimPDF(medicaoId: string, opts: GenerarOpts = {}) {
  const modo = opts.modo ?? "interno";

  const [{ data: med }, { data: itens }, { data: alteracoes }, { data: aprovs }] = await Promise.all([
    supabase
      .from("medicoes")
      .select("*, contratos(numero_dj, tipo_servico, centro_custo, fornecedor_nome, fornecedor_codigo, fornecedor_cnpj, base_dias_garantia, observacoes, clientes(razao_social, cnpj))")
      .eq("id", medicaoId)
      .single(),
    supabase
      .from("medicao_itens")
      .select("*, equipamentos(serie, tag, tipo, modelo)")
      .eq("medicao_id", medicaoId)
      .order("created_at"),
    supabase
      .from("medicao_item_alteracoes")
      .select("*")
      .eq("medicao_id", medicaoId)
      .order("created_at", { ascending: false }),
    supabase
      .from("aprovacoes")
      .select("*")
      .eq("medicao_id", medicaoId)
      .order("created_at"),
  ]);

  if (!med) throw new Error("Medição não encontrada");
  if (med.status === "cancelada") {
    throw new Error("Não é permitido gerar PDF de medição cancelada.");
  }

  // Carrega importação separada (se houver)
  let importacao: any = null;
  if ((med as any).importacao_id) {
    const { data: imp } = await supabase
      .from("importacoes")
      .select("arquivo_nome, created_at")
      .eq("id", (med as any).importacao_id)
      .maybeSingle();
    importacao = imp;
  }

  const isRascunho = med.status === "rascunho";
  const isEmRevisao = med.status === "em_revisao_interna" || med.status === "aprovada_internamente";
  const watermarkText = isRascunho ? "RASCUNHO" : (isEmRevisao ? "EM REVISÃO" : null);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 12;
  let y = 14;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - 15) {
      doc.addPage();
      y = 14;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(10);
    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, y, pageW - marginX * 2, 6.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title, marginX + 2, y + 4.6);
    doc.setTextColor(0, 0, 0);
    y += 9;
  };

  // === Cabeçalho ===
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text("Módulo de Medição - MC Terraplenagem", marginX, y);
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(`Boletim de Medição${modo === "cliente" ? " — Versão Cliente" : ""}`, marginX, y + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const geradoEm = new Date().toLocaleString("pt-BR");
  doc.text(`Gerado em: ${geradoEm}`, pageW - marginX, y, { align: "right" });
  doc.text(`Status: ${STATUS_LABEL[med.status] ?? med.status}`, pageW - marginX, y + 4, { align: "right" });

  doc.setTextColor(0, 0, 0);
  y += 10;

  doc.setDrawColor(200, 200, 200);
  doc.line(marginX, y, pageW - marginX, y);
  y += 4;

  // === Identificação (duas colunas independentes) ===
  const cliente = (med as any).contratos?.clientes?.razao_social ?? "-";
  let fornecedorNome: string | null = (med as any).fornecedor_locadora || (med as any).contratos?.fornecedor_nome || null;
  let fornecedorCodigo: string | null = (med as any).contratos?.fornecedor_codigo || null;
  if (!fornecedorNome) {
    const { data: ee } = await supabase
      .from("empresa_emissora")
      .select("razao_social")
      .eq("padrao", true)
      .maybeSingle();
    fornecedorNome = ee?.razao_social || FORNECEDOR_PADRAO_NOME;
    if (!fornecedorCodigo) fornecedorCodigo = FORNECEDOR_PADRAO_CODIGO;
  }
  const fornecedorTexto = fornecedorNome;

  const colEsq: [string, string][] = [
    ["Cliente / Contratante", cliente],
    ["Contrato / Nº DJ", (med as any).contratos?.numero_dj ?? "-"],
    ["Centro de custo", (med as any).contratos?.centro_custo ?? "-"],
    ["Período", `${fmtDate(med.periodo_inicio)} a ${fmtDate(med.periodo_fim)}`],
  ];
  const colDir: [string, string][] = [
    ["Fornecedor / Locadora", fornecedorTexto],
    ["Código fornecedor", fornecedorCodigo ? String(fornecedorCodigo) : "-"],
    ["Tipo de serviço", (med as any).contratos?.tipo_servico ?? "-"],
    ["Competência", fmtCompetencia(med.competencia)],
    ["Status", STATUS_LABEL[med.status] ?? med.status],
  ];

  doc.setFontSize(8);
  const gap = 6;
  const colWidth = (pageW - marginX * 2 - gap) / 2;

  const renderColuna = (rows: [string, string][], xBase: number, labelW: number): number => {
    const valueW = colWidth - labelW - 1;
    let cy = y;
    rows.forEach(([label, valor]) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`${label}:`, xBase, cy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      // Reduz fonte para nomes longos (ex.: razão social do fornecedor)
      let fSize = 8;
      if (String(valor).length > 36) fSize = 7.2;
      if (String(valor).length > 60) fSize = 6.6;
      doc.setFontSize(fSize);
      const wrapped = doc.splitTextToSize(String(valor), valueW);
      doc.text(wrapped, xBase + labelW, cy);
      const lineH = fSize <= 6.6 ? 3.2 : fSize <= 7.2 ? 3.6 : 4;
      cy += Math.max(1, wrapped.length) * lineH + 1;
    });
    doc.setFontSize(8);
    return cy;
  };

  const yEsq = renderColuna(colEsq, marginX, 36);
  const yDir = renderColuna(colDir, marginX + colWidth + gap, 32);
  y = Math.max(yEsq, yDir) + 3;



  // === Resumo financeiro ===
  sectionTitle("RESUMO FINANCEIRO");
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    head: [["Indicador", "Valor"]],
    body: [
      ["Total de horas informadas", fmtNum(med.total_horas_informadas)],
      ["Total de horas líquidas", fmtNum(med.total_horas_liquidas)],
      ["Total de horas a pagar", fmtNum(med.total_horas_pagar)],
      ["Valor bruto", fmtBRL(med.valor_bruto)],
      ["Total de complementares", fmtBRL(med.valor_complementares)],
      ["Total de descontos", fmtBRL(med.valor_descontos)],
      [{ content: "Valor final", styles: { fontStyle: "bold" } }, { content: fmtBRL(med.valor_final), styles: { fontStyle: "bold", textColor: [30, 41, 59] } }],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  const itensList = itens ?? [];

  if (modo === "cliente") {
    // Versão Cliente: tabela RESUMIDA em retrato (mesma orientação do resto do PDF)
    ensureSpace(15);
    sectionTitle("ITENS DA MEDIÇÃO");
    const bodyCli = itensList.map((i: any) => {
      const m3 = (Array.isArray(i.regras_aplicadas) ? i.regras_aplicadas : []).find((r: any) => r?.tipo === "m3_importacao");
      const garantiaCol = m3
        ? fmtNum(m3.garantia_aplicada ?? i.garantia_minima)
        : fmtNum(i.garantia_proporcional_horas);
      return [
        i.equipamentos?.serie ?? "-",
        i.equipamentos?.tag ?? "-",
        i.equipamentos?.tipo ?? "-",
        i.equipamentos?.modelo ?? "-",
        fmtNum(i.horas_informadas),
        m3 ? (m3.tipo_pagamento || "-") : String(i.dias_considerados ?? "-"),
        garantiaCol,
        fmtNum(i.horas_a_pagar),
        fmtBRL(i.valor_hora),
        fmtBRL(i.valor_final),
      ];
    });
    const isAnyM3 = itensList.some((i: any) => (Array.isArray(i.regras_aplicadas) ? i.regras_aplicadas : []).some((r: any) => r?.tipo === "m3_importacao"));
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5, halign: "center" },
      columnStyles: {
        0: { cellWidth: 20 },                                  // Série
        1: { cellWidth: 16 },                                  // Tag
        2: { cellWidth: 26 },                                  // Tipo
        3: { cellWidth: 26 },                                  // Modelo
        4: { cellWidth: 16, halign: "right" },                 // HT inf
        5: { cellWidth: 13, halign: "center" },                // Dias / Tipo pgto
        6: { cellWidth: 18, halign: "right" },                 // Gar. prop / Garantia aplicada
        7: { cellWidth: 18, halign: "right" },                 // H. pagar
        8: { cellWidth: 22, halign: "right" },                 // Valor/h
        9: { cellWidth: 23, halign: "right", fontStyle: "bold" }, // Valor final
      },
      head: [[
        "Série", "Tag", "Tipo", "Modelo",
        "HT\ninformado",
        isAnyM3 ? "Tipo\npagto" : "Dias",
        isAnyM3 ? "Garantia\naplicada" : "Gar.\nprop.",
        "Horas\na pagar", "Valor/hora", "Valor final",
      ]],
      body: bodyCli,
      rowPageBreak: "avoid",
      showHead: "everyPage",
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  } else {
    // Versão Interna: tabela COMPLETA em página paisagem
    doc.addPage("a4", "landscape");
    const lpW = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59);
    doc.rect(10, 10, lpW - 20, 6.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("ITENS DA MEDIÇÃO", 12, 14.6);
    doc.setTextColor(0, 0, 0);

    const body = itensList.map((i: any) => {
      const htCalc = Number(i.horimetro_final ?? 0) - Number(i.horimetro_inicial ?? 0);
      return [
        i.equipamentos?.serie ?? "-",
        i.equipamentos?.tag ?? "-",
        i.equipamentos?.tipo ?? "-",
        i.equipamentos?.modelo ?? "-",
        fmtNum(i.horimetro_inicial),
        fmtNum(i.horimetro_final),
        fmtNum(htCalc),
        fmtNum(i.horas_informadas),
        fmtNum(i.horas_liquidas),
        fmtNum(i.garantia_mensal_horas ?? i.garantia_minima),
        String(i.dias_considerados ?? "-"),
        fmtNum(i.garantia_proporcional_horas),
        i.aplicar_garantia_proporcional ? "Sim" : "Não",
        fmtNum(i.horas_a_pagar),
        fmtBRL(i.valor_hora),
        fmtBRL(i.valor_complementares),
        fmtBRL(i.valor_descontos),
        fmtBRL(i.valor_final),
      ];
    });
    autoTable(doc, {
      startY: 20,
      margin: { left: 8, right: 8 },
      theme: "grid",
      tableWidth: lpW - 16,
      styles: { fontSize: 6.5, cellPadding: 1.2, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.5, halign: "center" },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 13 },
        2: { cellWidth: 26 },
        3: { cellWidth: 26 },
        4: { cellWidth: 14, halign: "right" },
        5: { cellWidth: 14, halign: "right" },
        6: { cellWidth: 12, halign: "right" },
        7: { cellWidth: 12, halign: "right" },
        8: { cellWidth: 12, halign: "right" },
        9: { cellWidth: 14, halign: "right" },
        10: { cellWidth: 9, halign: "center" },
        11: { cellWidth: 14, halign: "right" },
        12: { cellWidth: 11, halign: "center" },
        13: { cellWidth: 14, halign: "right" },
        14: { cellWidth: 18, halign: "right" },
        15: { cellWidth: 14, halign: "right" },
        16: { cellWidth: 14, halign: "right" },
        17: { cellWidth: 24, halign: "right", fontStyle: "bold" },
      },
      head: [[
        "Série", "Tag", "Tipo", "Modelo",
        "Horím.\nInicial", "Horím.\nFinal", "HT\ncalc.", "HT\ninf.",
        "Horas\nlíq.", "Gar.\nmensal", "Dias", "Gar.\nprop.",
        "Prop.?", "Horas\na pagar", "Valor/hora", "Compl.", "Desc.", "Valor final",
      ]],
      body,
      rowPageBreak: "avoid",
      showHead: "everyPage",
    });

    // Volta para retrato nas demais seções
    doc.addPage("a4", "portrait");
    y = 14;
  }

  // === Memória de Cálculo ===
  sectionTitle("MEMÓRIA DE CÁLCULO POR EQUIPAMENTO");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  itensList.forEach((i: any, idx: number) => {
    ensureSpace(38);
    const titulo = `${idx + 1}. ${i.equipamentos?.tipo ?? ""} ${i.equipamentos?.modelo ?? ""} — Tag ${i.equipamentos?.tag ?? "-"}${i.equipamentos?.serie ? ` / Série ${i.equipamentos.serie}` : ""}`;
    doc.setFont("helvetica", "bold");
    doc.setFillColor(241, 245, 249);
    doc.rect(marginX, y, pageW - marginX * 2, 5, "F");
    doc.text(titulo, marginX + 1.5, y + 3.5);
    y += 6;

    doc.setFont("helvetica", "normal");
    const m3Marker = (Array.isArray(i.regras_aplicadas) ? i.regras_aplicadas : []).find((r: any) => r?.tipo === "m3_importacao");
    const baseDias = (med as any).contratos?.base_dias_garantia ?? 30;
    const dias = i.dias_considerados ?? baseDias;
    const garMensal = Number(i.garantia_mensal_horas ?? i.garantia_minima ?? 0);
    const garProp = Number(i.garantia_proporcional_horas ?? 0);
    const aplicaProp = !!i.aplicar_garantia_proporcional;
    const ht = Number(i.horas_informadas ?? 0);
    const hLiq = Number(i.horas_liquidas ?? 0);
    const hPagar = Number(i.horas_a_pagar ?? 0);
    const hMec = Number(i.horas_mecanicas ?? 0);
    const vh = Number(i.valor_hora ?? 0);
    const vBruto = Number(i.valor_bruto ?? 0);
    const vCompl = Number(i.valor_complementares ?? 0);
    const vDesc = Number(i.valor_descontos ?? 0);
    const vFinal = Number(i.valor_final ?? 0);

    const linhas: string[] = [];
    linhas.push(`Período efetivo: ${fmtDate(i.data_inicio_operacao_item ?? i.periodo_inicio ?? med.periodo_inicio)} a ${fmtDate(i.data_fim_operacao_item ?? i.periodo_fim ?? med.periodo_fim)}`);

    if (m3Marker) {
      // Memória de cálculo do Modelo M3 — respeita os valores importados da planilha
      const tipoPgto = String(m3Marker.tipo_pagamento || "").toUpperCase().replace(/\s+/g, "").replace(/\./g, "");
      const isHG = tipoPgto.includes("HG");
      const isHT = tipoPgto.includes("HT");
      const garAplic = Number(m3Marker.garantia_aplicada ?? i.garantia_minima ?? 0);
      const htInf = Number(m3Marker.ht_informado ?? ht);
      const hMecM3 = Number(m3Marker.horas_mecanicas ?? hMec);
      const hPagarBruto = Number(m3Marker.horas_pagar_bruto ?? (isHG ? garAplic : htInf));
      const hPagarLiq = Number(m3Marker.horas_pagar_liquido ?? hPagar);
      const tipoLabel = isHG ? "H.G. — Horas Garantidas" : isHT ? "H.T. — Horas Trabalhadas" : (m3Marker.tipo_pagamento || "-");

      linhas.push(`Modelo: M3 — Controle de Horímetros Obras Ápia`);
      linhas.push(`Tipo de pagamento: ${tipoLabel}`);
      if (isHG) {
        linhas.push(`Garantia aplicada conforme planilha/importação: ${fmtNum(garAplic)} h`);
        linhas.push(`Horas a pagar bruto = Garantia aplicada = ${fmtNum(hPagarBruto)} h`);
      } else if (isHT) {
        linhas.push(`HT informado: ${fmtNum(htInf)} h`);
        linhas.push(`Horas a pagar bruto = HT informado = ${fmtNum(hPagarBruto)} h`);
      } else {
        linhas.push(`Garantia aplicada conforme planilha/importação: ${fmtNum(garAplic)} h`);
        linhas.push(`HT informado: ${fmtNum(htInf)} h`);
        linhas.push(`Horas a pagar bruto = ${fmtNum(hPagarBruto)} h (conforme planilha)`);
      }
      linhas.push(`Horas mecânicas: ${fmtNum(hMecM3)} h`);
      linhas.push(`Horas a pagar líquido = Horas a pagar bruto - Horas mecânicas = ${fmtNum(hPagarBruto)} - ${fmtNum(hMecM3)} = ${fmtNum(hPagarLiq)} h`);
      linhas.push(`Valor final = Horas a pagar líquido × Valor/hora = ${fmtNum(hPagarLiq)} × ${fmtBRL(vh)} = ${fmtBRL(vBruto)}`);
    } else {
      linhas.push(`Base de dias do contrato: ${baseDias} dia(s)  -  Dias considerados: ${dias}`);
      if (aplicaProp) {
        linhas.push(`Garantia proporcional = Garantia mensal / Base dias x Dias considerados`);
        linhas.push(`Garantia proporcional = ${fmtNum(garMensal)} / ${baseDias} x ${dias} = ${fmtNum(garProp)} h`);
        linhas.push(`Horas a pagar = MAX(HT informado; Garantia proporcional)`);
        linhas.push(`Horas a pagar = MAX(${fmtNum(ht)}; ${fmtNum(garProp)}) = ${fmtNum(hPagar)} h`);
      } else {
        linhas.push(`Horas liquidas = HT informado - Horas mecanicas = ${fmtNum(ht)} - ${fmtNum(i.horas_mecanicas)} = ${fmtNum(hLiq)} h`);
        linhas.push(`Horas a pagar = MAX(Horas liquidas; Garantia mensal)`);
        linhas.push(`Horas a pagar = MAX(${fmtNum(hLiq)}; ${fmtNum(garMensal)}) = ${fmtNum(hPagar)} h`);
      }
      linhas.push(`Valor bruto = ${fmtNum(hPagar)} x ${fmtBRL(vh)} = ${fmtBRL(vBruto)}`);
    }
    linhas.push(`Valor final = Valor bruto + Complementares - Descontos`);
    linhas.push(`Valor final = ${fmtBRL(vBruto)} + ${fmtBRL(vCompl)} - ${fmtBRL(vDesc)} = ${fmtBRL(vFinal)}`);

    linhas.forEach((l) => {
      ensureSpace(4);
      doc.text(l, marginX + 2, y);
      y += 3.6;
    });
    y += 2;
  });

  // === Critérios de cálculo importados (apenas M3) ===
  const isAnyM3Med = itensList.some((i: any) =>
    (Array.isArray(i.regras_aplicadas) ? i.regras_aplicadas : []).some((r: any) => r?.tipo === "m3_importacao")
  );
  if (isAnyM3Med) {
    ensureSpace(20);
    sectionTitle("CRITÉRIOS DE CÁLCULO IMPORTADOS");
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const txt = "Esta medição foi importada pelo Modelo M3 — Controle de Horímetros Obras Ápia. As garantias aplicadas, tipo de pagamento, horas a pagar e valores finais foram importados da planilha base e conferidos pelo sistema.";
    const wrapped = doc.splitTextToSize(txt, pageW - marginX * 2 - 2);
    ensureSpace(wrapped.length * 3.8 + 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 3.8 + 3;
  }

  // === Regras Contratuais Aplicadas ===
  ensureSpace(15);
  sectionTitle("REGRAS CONTRATUAIS APLICADAS");
  const regrasRows: any[] = [];
  itensList.forEach((i: any) => {
    const regras = Array.isArray(i.regras_aplicadas) ? i.regras_aplicadas : [];
    const equipLabel = `${i.equipamentos?.tag ?? "-"}${i.equipamentos?.serie ? ` / ${i.equipamentos.serie}` : ""}`;
    regras.forEach((r: any) => {
      // Não tratar marcadores de importação como regras contratuais
      const tipoStr = String(r?.tipo ?? "").toLowerCase();
      if (tipoStr === "m3_importacao" || tipoStr === "importacao" || tipoStr.includes("importac")) return;
      const isProp = r.tipo === "garantia_proporcional";
      const detalhe = isProp
        ? `Dias: ${r.dias_considerados ?? "-"}/${r.base_dias ?? "-"}  -  Gar. mensal: ${fmtNum(r.garantia_mensal)} h  -  Gar. prop.: ${fmtNum(r.garantia_proporcional)} h`
        : (r.tipo_equipamento ?? r.nome ?? "-");
      const valorCol = r.valor != null
        ? fmtBRL(r.valor)
        : (r.horas != null ? `${fmtNum(r.horas)} h`
        : (r.garantia_proporcional != null ? `${fmtNum(r.garantia_proporcional)} h` : "-"));
      regrasRows.push([
        labelTipoRegra(r.tipo),
        labelOrigemRegra(r.origem),
        equipLabel,
        valorCol,
        `${fmtNum(i.horas_a_pagar)} h`,
        fmtBRL(i.valor_final),
        detalhe,
      ]);
    });
  });

  if (regrasRows.length === 0) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text("Nenhuma regra contratual adicional aplicada nesta medição.", marginX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    y += 5;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 26 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22, halign: "right" },
        4: { cellWidth: 18, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: "auto" },
      },
      head: [["Tipo", "Escopo", "Equipamento", "Valor / Horas", "H. pagar", "Valor final", "Detalhe"]],
      body: regrasRows,
      rowPageBreak: "avoid",
      showHead: "everyPage",
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // === Observações ===
  ensureSpace(15);
  sectionTitle("OBSERVAÇÕES");
  doc.setFontSize(8);
  // Arquivo de origem: apenas no PDF interno (uso da equipe técnica)
  if (modo === "interno" && importacao?.arquivo_nome) {
    doc.setFont("helvetica", "bold");
    doc.text(`Arquivo de origem interno: `, marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(importacao.arquivo_nome), marginX + 42, y);
    y += 4.5;
  }
  const isImportObs = (s: string) => /\bimportad[oa]\b/i.test(s) || /\.xlsx?\b/i.test(s) || /\.csv\b/i.test(s);
  const obs: string[] = [];
  if (med.observacoes && !(modo === "cliente" && isImportObs(String(med.observacoes)))) obs.push(`${med.observacoes}`);
  if ((med as any).contratos?.observacoes) obs.push(`Observação do contrato: ${(med as any).contratos.observacoes}`);
  itensList.forEach((i: any) => {
    if (i.observacoes && !(modo === "cliente" && isImportObs(String(i.observacoes)))) obs.push(`${i.equipamentos?.tag ?? "-"}: ${i.observacoes}`);
    if (i.motivo_proporcionalidade) obs.push(`${i.equipamentos?.tag ?? "-"} (proporcionalidade): ${i.motivo_proporcionalidade}`);
  });
  if (obs.length === 0 && !(modo === "interno" && importacao?.arquivo_nome)) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text("Sem observações registradas.", marginX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    y += 5;
  } else {
    obs.forEach((o) => {
      const wrapped = doc.splitTextToSize(`- ${o}`, pageW - marginX * 2 - 2);
      ensureSpace(wrapped.length * 3.6 + 2);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 3.6 + 1;
    });
  }

  // === Histórico de Alterações ===
  ensureSpace(15);
  sectionTitle(modo === "cliente" ? "AJUSTES CONSIDERADOS NA MEDIÇÃO" : "HISTÓRICO DE ALTERAÇÕES");
  let histList = (alteracoes ?? []) as any[];

  if (modo === "cliente") {
    // 1) filtra entradas irrelevantes
    const filtered = histList.filter((l) => {
      if (l.motivo && /^teste$/i.test(String(l.motivo).trim())) return false;
      if (l.campo && valoresEquivalentes(l.valor_anterior, l.valor_novo)) return false;
      if (l.campo) return CAMPOS_RELEVANTES_CLIENTE.has(l.campo);
      const acao = String(l.acao ?? "").toUpperCase();
      return acao.includes("RECALCULO") || acao.includes("REGRAS") || acao.includes("PROPORCION");
    });

    // 2) consolida por (equipamento_id, campo): pega valor inicial (mais antigo) e valor final (mais recente)
    // alteracoes vem ordenado DESC (mais recente primeiro)
    const byKey = new Map<string, { equip: string; campo: string; primeiro: any; ultimo: any; data: string }>();
    for (const l of filtered) {
      if (!l.campo) continue;
      const key = `${l.equipamento_item_id ?? l.equipamento_tag ?? "_"}|${l.campo}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          equip: l.equipamento_tag ?? "-",
          campo: l.campo,
          primeiro: l.valor_anterior, // será sobrescrito pelas entradas mais antigas
          ultimo: l.valor_novo,        // primeira entrada (mais recente) tem o valor mais novo
          data: l.created_at,
        });
      } else {
        // Entradas seguintes são mais antigas → atualiza "primeiro" (valor anterior original)
        existing.primeiro = l.valor_anterior;
      }
    }

    // 3) remove ajustes cujo primeiro==ultimo (revertidos)
    histList = Array.from(byKey.values()).filter((r) => !valoresEquivalentes(r.primeiro, r.ultimo));
  }

  if (histList.length === 0) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text(modo === "cliente" ? "Nenhum ajuste relevante registrado." : "Nenhuma alteração registrada.", marginX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    y += 5;
  } else if (modo === "cliente") {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 50 },
        2: { cellWidth: 42, halign: "right" },
        3: { cellWidth: 42, halign: "right", fontStyle: "bold" },
      },
      head: [["Equipamento", "Item ajustado", "Anterior", "Atual"]],
      body: histList.map((r: any) => [
        r.equip,
        FIELD_LABEL[r.campo] ?? r.campo,
        formatValorHistorico(r.campo, r.primeiro),
        formatValorHistorico(r.campo, r.ultimo),
      ]),
      rowPageBreak: "avoid",
      showHead: "everyPage",
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      styles: { fontSize: 6.5, cellPadding: 1, overflow: "linebreak" },
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 28 },
        2: { cellWidth: 18 },
        3: { cellWidth: 24 },
        4: { cellWidth: 22, halign: "right" as const },
        5: { cellWidth: 22, halign: "right" as const },
        6: { cellWidth: "auto" as const },
      },
      head: [["Data/Hora", "Usuário", "Equip.", "Campo", "Anterior", "Novo", "Motivo"]],
      body: histList.slice(0, 200).map((l: any) => [
        new Date(l.created_at).toLocaleString("pt-BR"),
        l.user_email ?? "-",
        l.equipamento_tag ?? "-",
        l.campo ? (FIELD_LABEL[l.campo] ?? l.campo) : (l.acao ?? "-"),
        formatValorHistorico(l.campo, l.valor_anterior),
        formatValorHistorico(l.campo, l.valor_novo),
        l.motivo ?? "-",
      ]),
      rowPageBreak: "avoid",
      showHead: "everyPage",
    });
    y = (doc as any).lastAutoTable.finalY + 5;
    if (histList.length > 200) {
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Exibindo as 200 alterações mais recentes de ${histList.length}.`, marginX, y);
      doc.setTextColor(0, 0, 0);
      y += 4;
    }
  }

  // === Assinaturas ===
  // Altura total estimada do bloco (título + espaço + linhas + rótulos + data)
  const ASSINATURAS_BLOCO_H = 55;
  // Garante que o bloco inteiro caiba na mesma página; senão, força nova página
  const espacoDisponivel = pageH - 15 - y;
  if (espacoDisponivel < ASSINATURAS_BLOCO_H) {
    doc.addPage();
    y = 14;
  }
  sectionTitle("ASSINATURAS");
  y += 14;
  const sigW = (pageW - marginX * 2 - 10) / 3;
  const sigY = y;
  const responsavelLocadora = fornecedorNome
    ? `Responsável ${fornecedorNome.split(/\s+/).slice(0, 2).join(" ")} / Locadora`
    : "Responsável Locadora / Fornecedor";
  const sigLabels = [responsavelLocadora, "Responsável pela conferência", "Cliente / Aprovador"];
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  sigLabels.forEach((lbl, i) => {
    const xx = marginX + i * (sigW + 5);
    doc.line(xx, sigY, xx + sigW, sigY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    const wrapped = doc.splitTextToSize(lbl, sigW);
    doc.text(wrapped, xx + sigW / 2, sigY + 4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("Nome / Assinatura", xx + sigW / 2, sigY + 4 + wrapped.length * 3 + 2, { align: "center" });
    doc.setTextColor(0, 0, 0);
  });
  y = sigY + 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Data da aprovação: ____ / ____ / ________`, marginX, y);
  y += 5;

  // === Marca d'água + Rodapé ===
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const curW = doc.internal.pageSize.getWidth();
    const curH = doc.internal.pageSize.getHeight();

    if (watermarkText) {
      doc.saveGraphicsState();
      // @ts-ignore
      doc.setGState(new (doc as any).GState({ opacity: 0.06 }));
      doc.setFont("helvetica", "bold");
      const fontSize = watermarkText.length > 9 ? 80 : 110;
      doc.setFontSize(fontSize);
      doc.setTextColor(220, 38, 38);
      doc.text(watermarkText, curW / 2, curH / 2, { align: "center", angle: 30 });
      doc.restoreGraphicsState();
      doc.setTextColor(0, 0, 0);
    }

    // Rodapé — três áreas (esquerda / centro / direita) sem sobreposição
    doc.setDrawColor(200, 200, 200);
    doc.line(10, curH - 11, curW - 10, curH - 11);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");

    const leftText = `Gerado pelo MedControl — MC Terraplenagem`;
    const centerText = geradoEm;
    const rightText = `Página ${p} de ${total}`;

    // Reserva espaços fixos para centro e direita; trunca a esquerda se preciso
    const rightW = doc.getTextWidth(rightText);
    const centerW = doc.getTextWidth(centerText);
    const safeGap = 6;
    const leftMaxW = (curW / 2) - centerW / 2 - 10 - safeGap;
    const leftWrapped = doc.splitTextToSize(leftText, Math.max(40, leftMaxW));
    const leftLine = Array.isArray(leftWrapped) ? leftWrapped[0] : String(leftWrapped);

    doc.text(leftLine, 10, curH - 7);
    doc.text(centerText, curW / 2, curH - 7, { align: "center" });
    doc.text(rightText, curW - 10, curH - 7, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  const sufixo = modo === "cliente" ? "-CLIENTE" : "";
  const wmSuffix = isRascunho ? "-RASCUNHO" : (isEmRevisao ? "-EM-REVISAO" : "");
  const fileName = `boletim-${(med as any).contratos?.numero_dj ?? "medicao"}-${String(med.competencia).slice(0, 7)}${wmSuffix}${sufixo}.pdf`;

  if (opts.preview) {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } else {
    doc.save(fileName);
  }
}
