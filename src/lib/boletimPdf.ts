import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtNum, fmtDate, fmtCompetencia } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  importada: "Importada",
  revisao_tecnica: "Em revisão técnica",
  aprovacao_gerencial: "Em aprovação gerencial",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  faturada: "Faturada",
  paga: "Paga",
  cancelada: "Cancelada",
};

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
};

interface GenerarOpts {
  preview?: boolean; // se true, abre em nova aba; senão, faz download
}

export async function gerarBoletimPDF(medicaoId: string, opts: GenerarOpts = {}) {
  // Carrega dados completos
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

  const isRascunho = med.status === "rascunho";
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
  doc.text("MedControl", marginX, y);
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text("Boletim de Medição", marginX, y + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const geradoEm = new Date().toLocaleString("pt-BR");
  doc.text(`Gerado em: ${geradoEm}`, pageW - marginX, y, { align: "right" });
  doc.text(`Status: ${STATUS_LABEL[med.status] ?? med.status}`, pageW - marginX, y + 4, { align: "right" });

  doc.setTextColor(0, 0, 0);
  y += 10;

  // Linha
  doc.setDrawColor(200, 200, 200);
  doc.line(marginX, y, pageW - marginX, y);
  y += 4;

  // === Identificação ===
  const cliente = (med as any).contratos?.clientes?.razao_social ?? "-";
  const fornecedor = (med as any).contratos?.fornecedor_nome
    ? `${(med as any).contratos.fornecedor_nome}${(med as any).contratos.fornecedor_codigo ? ` (${(med as any).contratos.fornecedor_codigo})` : ""}`
    : "-";

  const ident: [string, string][] = [
    ["Cliente / Contratante", cliente],
    ["Fornecedor / Locadora", fornecedor],
    ["Contrato / Nº DJ", (med as any).contratos?.numero_dj ?? "-"],
    ["Tipo de serviço", (med as any).contratos?.tipo_servico ?? "-"],
    ["Centro de custo", (med as any).contratos?.centro_custo ?? "-"],
    ["Competência", fmtCompetencia(med.competencia)],
    ["Período", `${fmtDate(med.periodo_inicio)} a ${fmtDate(med.periodo_fim)}`],
    ["Status", STATUS_LABEL[med.status] ?? med.status],
  ];

  doc.setFontSize(8);
  const colW = (pageW - marginX * 2) / 2;
  ident.forEach((row, i) => {
    const col = i % 2;
    const line = Math.floor(i / 2);
    const xx = marginX + col * colW;
    const yy = y + line * 5;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text(`${row[0]}:`, xx, yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(String(row[1]), xx + 36, yy);
  });
  y += Math.ceil(ident.length / 2) * 5 + 4;

  // === 2. Resumo financeiro ===
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

  // === 3. Itens da Medição ===
  sectionTitle("ITENS DA MEDIÇÃO");
  const itensList = itens ?? [];
  const body = itensList.map((i: any) => {
    const htCalc = Number(i.horimetro_final ?? 0) - Number(i.horimetro_inicial ?? 0);
    const div = htCalc - Number(i.horas_informadas ?? 0);
    return [
      i.equipamentos?.serie ?? "-",
      i.equipamentos?.tag ?? "-",
      i.equipamentos?.tipo ?? "-",
      i.equipamentos?.modelo ?? "-",
      fmtNum(i.horimetro_inicial),
      fmtNum(i.horimetro_final),
      fmtNum(htCalc),
      fmtNum(i.horas_informadas),
      fmtNum(div),
      fmtNum(i.horas_mecanicas),
      fmtNum(i.horas_liquidas),
      fmtNum(i.garantia_mensal_horas ?? i.garantia_minima),
      i.dias_considerados ?? "-",
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
    startY: y,
    margin: { left: 6, right: 6 },
    theme: "grid",
    styles: { fontSize: 6, cellPadding: 1, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6 },
    head: [[
      "Série", "Tag", "Tipo", "Modelo", "Horím. Ini.", "Horím. Fim", "HT calc.",
      "HT inf.", "Diverg.", "H. mec.", "H. líq.", "Gar. mensal", "Dias",
      "Gar. prop.", "Prop.?", "H. pagar", "Valor/h", "Compl.", "Desc.", "Valor final",
    ]],
    body,
    rowPageBreak: "avoid",
    showHead: "everyPage",
    didDrawPage: () => {
      // marca d'água por página será aplicada no final
    },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // === 4. Memória de Cálculo ===
  ensureSpace(20);
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
    const baseDias = (med as any).contratos?.base_dias_garantia ?? 30;
    const dias = i.dias_considerados ?? baseDias;
    const garMensal = Number(i.garantia_mensal_horas ?? i.garantia_minima ?? 0);
    const garProp = Number(i.garantia_proporcional_horas ?? 0);
    const aplicaProp = !!i.aplicar_garantia_proporcional;
    const garEfetiva = aplicaProp ? garProp : garMensal;
    const ht = Number(i.horas_informadas ?? 0);
    const hLiq = Number(i.horas_liquidas ?? 0);
    const hPagar = Number(i.horas_a_pagar ?? 0);
    const vh = Number(i.valor_hora ?? 0);
    const vBruto = Number(i.valor_bruto ?? 0);
    const vCompl = Number(i.valor_complementares ?? 0);
    const vDesc = Number(i.valor_descontos ?? 0);
    const vFinal = Number(i.valor_final ?? 0);

    const linhas: string[] = [];
    linhas.push(`Período efetivo: ${fmtDate(i.data_inicio_operacao_item ?? i.periodo_inicio ?? med.periodo_inicio)} a ${fmtDate(i.data_fim_operacao_item ?? i.periodo_fim ?? med.periodo_fim)}`);
    linhas.push(`Base de dias do contrato: ${baseDias} dia(s)  •  Dias considerados: ${dias}`);
    if (aplicaProp) {
      linhas.push(`Garantia proporcional = Garantia mensal / Base dias × Dias considerados`);
      linhas.push(`Garantia proporcional = ${fmtNum(garMensal)} / ${baseDias} × ${dias} = ${fmtNum(garProp)} h`);
      linhas.push(`Horas a pagar = MAX(HT informado; Garantia proporcional)`);
      linhas.push(`Horas a pagar = MAX(${fmtNum(ht)}; ${fmtNum(garProp)}) = ${fmtNum(hPagar)} h`);
    } else {
      linhas.push(`Horas líquidas = HT informado − Horas mecânicas = ${fmtNum(ht)} − ${fmtNum(i.horas_mecanicas)} = ${fmtNum(hLiq)} h`);
      linhas.push(`Horas a pagar = MAX(Horas líquidas; Garantia mensal)`);
      linhas.push(`Horas a pagar = MAX(${fmtNum(hLiq)}; ${fmtNum(garMensal)}) = ${fmtNum(hPagar)} h`);
    }
    linhas.push(`Valor bruto = ${fmtNum(hPagar)} × ${fmtBRL(vh)} = ${fmtBRL(vBruto)}`);
    linhas.push(`Valor final = Valor bruto + Complementares − Descontos`);
    linhas.push(`Valor final = ${fmtBRL(vBruto)} + ${fmtBRL(vCompl)} − ${fmtBRL(vDesc)} = ${fmtBRL(vFinal)}`);

    linhas.forEach((l) => {
      ensureSpace(4);
      doc.text(l, marginX + 2, y);
      y += 3.6;
    });
    y += 2;
  });

  // === 5. Regras Contratuais Aplicadas ===
  ensureSpace(15);
  sectionTitle("REGRAS CONTRATUAIS APLICADAS");
  const regrasRows: any[] = [];
  itensList.forEach((i: any) => {
    const regras = Array.isArray(i.regras_aplicadas) ? i.regras_aplicadas : [];
    regras.forEach((r: any) => {
      regrasRows.push([
        r.tipo ?? "-",
        r.origem ?? "-",
        `${i.equipamentos?.tag ?? "-"}${i.equipamentos?.serie ? ` / ${i.equipamentos.serie}` : ""}`,
        r.valor != null ? fmtBRL(r.valor) : (r.horas != null ? `${fmtNum(r.horas)} h` : "-"),
        r.garantia_proporcional != null ? `${fmtNum(r.garantia_proporcional)} h` : "-",
        r.tipo_equipamento ?? r.nome ?? "-",
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
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59] },
      head: [["Tipo", "Escopo", "Equipamento", "Valor / Horas", "Gar. Proporc.", "Detalhe"]],
      body: regrasRows,
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // === 6. Observações ===
  ensureSpace(15);
  sectionTitle("OBSERVAÇÕES");
  doc.setFontSize(8);
  const obs: string[] = [];
  if (med.observacoes) obs.push(`Geral: ${med.observacoes}`);
  if ((med as any).contratos?.observacoes) obs.push(`Contrato: ${(med as any).contratos.observacoes}`);
  itensList.forEach((i: any) => {
    if (i.observacoes) obs.push(`${i.equipamentos?.tag ?? "-"}: ${i.observacoes}`);
    if (i.motivo_proporcionalidade) obs.push(`${i.equipamentos?.tag ?? "-"} (proporcionalidade): ${i.motivo_proporcionalidade}`);
  });
  if (obs.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text("Sem observações registradas.", marginX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    y += 5;
  } else {
    obs.forEach((o) => {
      const wrapped = doc.splitTextToSize(`• ${o}`, pageW - marginX * 2 - 2);
      ensureSpace(wrapped.length * 3.6 + 2);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 3.6 + 1;
    });
  }

  // === 7. Histórico de Alterações ===
  ensureSpace(15);
  sectionTitle("HISTÓRICO DE ALTERAÇÕES");
  const histList = alteracoes ?? [];
  if (histList.length === 0) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text("Nenhuma alteração registrada.", marginX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    y += 5;
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
        3: { cellWidth: 22 },
        4: { cellWidth: 24 },
        5: { cellWidth: 24 },
        6: { cellWidth: "auto" },
      },
      head: [["Data/Hora", "Usuário", "Equip.", "Campo", "Anterior", "Novo", "Motivo"]],
      body: histList.slice(0, 200).map((l: any) => [
        new Date(l.created_at).toLocaleString("pt-BR"),
        l.user_email ?? "-",
        l.equipamento_tag ?? "-",
        l.campo ? (FIELD_LABEL[l.campo] ?? l.campo) : (l.acao ?? "-"),
        l.valor_anterior ?? "-",
        l.valor_novo ?? "-",
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

  // === 8. Assinaturas ===
  ensureSpace(45);
  sectionTitle("ASSINATURAS");
  y += 12;
  const sigW = (pageW - marginX * 2 - 10) / 3;
  const sigY = y;
  const sigLabels = ["Responsável pela medição", "Responsável pela conferência", "Cliente / Aprovador"];
  doc.setDrawColor(80, 80, 80);
  sigLabels.forEach((lbl, i) => {
    const xx = marginX + i * (sigW + 5);
    doc.line(xx, sigY, xx + sigW, sigY);
    doc.setFontSize(7.5);
    doc.text(lbl, xx + sigW / 2, sigY + 4, { align: "center" });
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("Nome / Assinatura", xx + sigW / 2, sigY + 8, { align: "center" });
    doc.setTextColor(0, 0, 0);
  });
  y = sigY + 14;
  doc.setFontSize(8);
  doc.text(`Data da aprovação: ____ / ____ / ________`, marginX, y);
  y += 5;

  // === Marca d'água RASCUNHO + Rodapé em todas as páginas ===
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);

    if (isRascunho) {
      doc.saveGraphicsState();
      // @ts-ignore
      doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(110);
      doc.setTextColor(220, 38, 38);
      doc.text("RASCUNHO", pageW / 2, pageH / 2, { align: "center", angle: 30 });
      doc.restoreGraphicsState();
      doc.setTextColor(0, 0, 0);
    }

    // Rodapé
    doc.setDrawColor(200, 200, 200);
    doc.line(marginX, pageH - 11, pageW - marginX, pageH - 11);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text("Documento gerado automaticamente pelo MedControl", marginX, pageH - 7);
    doc.text(geradoEm, pageW / 2, pageH - 7, { align: "center" });
    doc.text(`Página ${p} de ${total}`, pageW - marginX, pageH - 7, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  const fileName = `boletim-${(med as any).contratos?.numero_dj ?? "medicao"}-${String(med.competencia).slice(0, 7)}${isRascunho ? "-RASCUNHO" : ""}.pdf`;

  if (opts.preview) {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } else {
    doc.save(fileName);
  }
}
