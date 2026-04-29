import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtBRL, fmtDate } from "@/lib/format";
import logoMcUrl from "@/assets/logo-mc.png";

let _logoDataUrl: string | null = null;
async function loadLogoDataUrl(): Promise<string | null> {
  if (_logoDataUrl) return _logoDataUrl;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = logoMcUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    _logoDataUrl = canvas.toDataURL("image/png");
    return _logoDataUrl;
  } catch (e) {
    console.error("[notaLocacaoPdf] Falha ao carregar logo:", e);
    return null;
  }
}
export async function getLogoDataUrl() { return loadLogoDataUrl(); }

export interface NotaLocacaoData {
  emissora: any;
  cliente: any;
  contrato: any;
  medicao: any;
  logoDataUrl?: string | null;
  fatura: {
    id: string;
    numero_nf?: string | null;
    data_emissao?: string | null;
    data_vencimento?: string | null;
    natureza_operacao?: string | null;
    codigo_item?: string | null;
    descricao_item?: string | null;
    quantidade?: number | null;
    valor_unitario?: number | null;
    valor_liquido?: number | null;
    valor_bruto?: number | null;
    local_servico?: string | null;
    numero_rf?: string | null;
    numero_contrato_cliente?: string | null;
    numero_pedido_item?: string | null;
    numero_frs?: string | null;
    numero_bm?: string | null;
    observacoes_nota?: string | null;
    dados_bancarios?: string | null;
  };
}

const box = (doc: jsPDF, x: number, y: number, w: number, h: number) => {
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
};

const label = (doc: jsPDF, txt: string, x: number, y: number, size = 7) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.text(txt, x, y);
};

const value = (doc: jsPDF, txt: string, x: number, y: number, size = 9) => {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.text(txt ?? "", x, y);
};

export function gerarNotaLocacaoPDF(d: NotaLocacaoData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 8;
  const right = W - M;

  // ==== Cabeçalho: emissora à esquerda + número/data/CNPJ à direita ====
  let y = M;
  const headerH = 42;
  box(doc, M, y, right - M, headerH);
  // Divisória vertical
  const divX = M + 120;
  doc.line(divX, y, divX, y + headerH);

  // Logo (se disponível)
  let textX = M + 3;
  if (d.logoDataUrl) {
    try {
      doc.addImage(d.logoDataUrl, "PNG", M + 2, y + 2, 32, 14, undefined, "FAST");
      textX = M + 38;
    } catch (e) {
      console.error("[notaLocacaoPdf] addImage falhou:", e);
    }
  }

  // Emissora
  doc.setFont("helvetica", "bold");
  const maxNomeW = divX - textX - 3;
  const nome = d.emissora?.razao_social ?? "EMPRESA EMISSORA";
  let nomeSize = 11;
  doc.setFontSize(nomeSize);
  while (doc.getTextWidth(nome) > maxNomeW && nomeSize > 7) {
    nomeSize -= 0.5;
    doc.setFontSize(nomeSize);
  }
  doc.text(nome, textX, y + 6, { maxWidth: maxNomeW });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const endL1 = [d.emissora?.endereco, d.emissora?.numero].filter(Boolean).join(", ");
  const endL2 = [d.emissora?.bairro, d.emissora?.complemento].filter(Boolean).join(" - ");
  const endL3 = `CEP: ${d.emissora?.cep ?? "-"} - ${d.emissora?.municipio ?? ""} - ${d.emissora?.uf ?? ""}`;
  doc.text(endL1, textX, y + 12);
  if (endL2) doc.text(endL2, textX, y + 17);
  doc.text(endL3, textX, y + 22);
  if (d.emissora?.telefone) doc.text(`TEL.: ${d.emissora.telefone}`, textX, y + 27);
  if (d.emissora?.email) doc.text(`E-mail: ${d.emissora.email}`, textX, y + 32);

  // Bloco direito (número/data/CNPJ/IE/IM)
  const cellH = headerH / 4;
  // Número da nota
  label(doc, "Número da Nota", divX + 3, y + 4);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(d.fatura?.numero_nf ?? "—", divX + 3, y + 10);
  doc.line(divX, y + cellH, right, y + cellH);
  // Data emissão
  label(doc, "Data de Emissão", divX + 3, y + cellH + 4);
  value(doc, fmtDate(d.fatura?.data_emissao), divX + 3, y + cellH + 9);
  doc.line(divX, y + cellH * 2, right, y + cellH * 2);
  // CNPJ
  label(doc, "CNPJ / CPF", divX + 3, y + cellH * 2 + 4);
  value(doc, d.emissora?.cnpj ?? "-", divX + 3, y + cellH * 2 + 9);
  doc.line(divX, y + cellH * 3, right, y + cellH * 3);
  // IE / IM
  const halfX = divX + (right - divX) / 2;
  doc.line(halfX, y + cellH * 3, halfX, y + headerH);
  label(doc, "Inscrição Estadual", divX + 3, y + cellH * 3 + 4);
  value(doc, d.emissora?.inscricao_estadual ?? "-", divX + 3, y + cellH * 3 + 9);
  label(doc, "Inscrição Municipal", halfX + 3, y + cellH * 3 + 4);
  value(doc, String(d.emissora?.inscricao_municipal ?? "-"), halfX + 3, y + cellH * 3 + 9);

  y += headerH;

  // ==== Natureza ====
  const natH = 9;
  box(doc, M, y, right - M, natH);
  label(doc, "Natureza da Operação", M + 2, y + 3);
  value(doc, d.fatura?.natureza_operacao ?? "3.01 LOCAÇÃO EQUIPAMENTO", M + 50, y + 6);
  y += natH;

  // ==== Dados do Cliente ====
  const cli = d.cliente ?? {};
  box(doc, M, y, right - M, 7);
  doc.setFillColor(235, 235, 235);
  doc.rect(M, y, right - M, 7, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Dados do Cliente", M + 2, y + 5);
  y += 7;

  // linha 1: nome + CNPJ
  const rowH = 11;
  box(doc, M, y, right - M, rowH);
  const split = M + 130;
  doc.line(split, y, split, y + rowH);
  label(doc, "Nome / Razão Social", M + 2, y + 3);
  value(doc, cli.razao_social ?? "-", M + 2, y + 8);
  label(doc, "CNPJ / CPF", split + 2, y + 3);
  value(doc, cli.cnpj ?? "-", split + 2, y + 8);
  y += rowH;

  // linha 2: endereço + bairro + IE
  box(doc, M, y, right - M, rowH);
  const x2 = M + 100, x3 = M + 150;
  doc.line(x2, y, x2, y + rowH);
  doc.line(x3, y, x3, y + rowH);
  label(doc, "Endereço", M + 2, y + 3);
  value(doc, cli.endereco ?? "-", M + 2, y + 8);
  label(doc, "Bairro", x2 + 2, y + 3);
  value(doc, cli.bairro ?? "-", x2 + 2, y + 8);
  label(doc, "Inscrição Estadual", x3 + 2, y + 3);
  value(doc, cli.inscricao_estadual ?? "-", x3 + 2, y + 8);
  y += rowH;

  // linha 3: cep + município + uf + fone
  box(doc, M, y, right - M, rowH);
  const c1 = M + 35, c2 = M + 110, c3 = M + 130;
  doc.line(c1, y, c1, y + rowH);
  doc.line(c2, y, c2, y + rowH);
  doc.line(c3, y, c3, y + rowH);
  label(doc, "CEP", M + 2, y + 3);
  value(doc, cli.cep ?? "-", M + 2, y + 8);
  label(doc, "Município", c1 + 2, y + 3);
  value(doc, cli.cidade ?? cli.municipio ?? "-", c1 + 2, y + 8);
  label(doc, "U.F.", c2 + 2, y + 3);
  value(doc, cli.uf ?? "-", c2 + 2, y + 8);
  label(doc, "Fone / Fax", c3 + 2, y + 3);
  value(doc, cli.contato_telefone ?? "-", c3 + 2, y + 8);
  y += rowH;

  // linha 4: complemento + vencimento + valor
  box(doc, M, y, right - M, rowH);
  doc.line(c2, y, c2, y + rowH);
  doc.line(c3 + 25, y, c3 + 25, y + rowH);
  label(doc, "Complemento", M + 2, y + 3);
  value(doc, cli.endereco_complemento ?? "-", M + 2, y + 8);
  label(doc, "Vencimento", c2 + 2, y + 3);
  value(doc, fmtDate(d.fatura?.data_vencimento), c2 + 2, y + 8);
  label(doc, "Valor", c3 + 27, y + 3);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(fmtBRL(d.fatura?.valor_liquido ?? d.fatura?.valor_unitario ?? 0), c3 + 27, y + 8);
  y += rowH;

  // ==== Dados do Equipamento / Item ====
  box(doc, M, y, right - M, 7);
  doc.setFillColor(235, 235, 235);
  doc.rect(M, y, right - M, 7, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Dados do Equipamento", M + 2, y + 5);
  y += 7;

  // header item
  const colDescW = 110, colQtdW = 20, colUniW = 30, colTotW = right - M - colDescW - colQtdW - colUniW;
  box(doc, M, y, right - M, 7);
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, right - M, 7, "F");
  let cx = M;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("Código e Descrição", cx + 2, y + 5); cx += colDescW;
  doc.line(cx, y, cx, y + 7);
  doc.text("Quantidade", cx + 2, y + 5); cx += colQtdW;
  doc.line(cx, y, cx, y + 7);
  doc.text("Valor Unitário", cx + 2, y + 5); cx += colUniW;
  doc.line(cx, y, cx, y + 7);
  doc.text("Valor Total", cx + 2, y + 5);
  y += 7;

  // descrição (multilinha)
  const desc = `${d.fatura?.codigo_item ? d.fatura.codigo_item + " - " : ""}${d.fatura?.descricao_item ?? "-"}`;
  const descLines = doc.splitTextToSize(desc, colDescW - 4);
  const itemH = Math.max(8, descLines.length * 4 + 4);
  box(doc, M, y, right - M, itemH);
  cx = M;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(descLines, cx + 2, y + 5); cx += colDescW;
  doc.line(cx, y, cx, y + itemH);
  doc.text(String(d.fatura?.quantidade ?? 1), cx + 2, y + 5); cx += colQtdW;
  doc.line(cx, y, cx, y + itemH);
  doc.text(fmtBRL(d.fatura?.valor_unitario ?? 0), cx + 2, y + 5); cx += colUniW;
  doc.line(cx, y, cx, y + itemH);
  doc.text(fmtBRL(d.fatura?.valor_liquido ?? d.fatura?.valor_unitario ?? 0), cx + 2, y + 5);
  y += itemH;

  // Linhas extras: local, RF, contrato, pedido, FRS, período, BM
  const extras = [
    `LOCAL DO SERVIÇO: ${d.fatura?.local_servico ?? "-"}`,
    d.fatura?.numero_rf ? `Nº RF: ${d.fatura.numero_rf}` : null,
    d.fatura?.numero_contrato_cliente ? `Nº CONTRATO: ${d.fatura.numero_contrato_cliente}` : null,
    d.fatura?.numero_pedido_item ? `Nº PEDIDO/ITEM: ${d.fatura.numero_pedido_item}` : null,
    d.fatura?.numero_frs ? `Nº FRS: ${d.fatura.numero_frs}` : null,
    `PERÍODO MEDIÇÃO: ${fmtDate(d.medicao?.periodo_inicio)} A ${fmtDate(d.medicao?.periodo_fim)}`,
    d.fatura?.numero_bm ? `BM: ${d.fatura.numero_bm}` : null,
  ].filter(Boolean) as string[];

  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  for (const t of extras) {
    box(doc, M, y, right - M, 6);
    doc.text(t, M + 2, y + 4);
    y += 6;
  }

  // espaço + total
  y += 4;
  const totalW = 70;
  box(doc, right - totalW, y, totalW, 12);
  doc.setFillColor(245, 245, 245);
  doc.rect(right - totalW, y, totalW, 12, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("Valor Total da Nota", right - totalW + 2, y + 5);
  doc.setFontSize(12);
  doc.text(fmtBRL(d.fatura?.valor_liquido ?? d.fatura?.valor_unitario ?? 0), right - totalW + 2, y + 10);
  y += 16;

  // Dados Adicionais
  box(doc, M, y, right - M, 7);
  doc.setFillColor(235, 235, 235);
  doc.rect(M, y, right - M, 7, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Dados Adicionais", M + 2, y + 5);
  y += 7;

  const bancarios = d.fatura?.dados_bancarios
    || `BANCO ${d.emissora?.banco ?? "-"}\nAG: ${d.emissora?.agencia ?? "-"}  -  C/C: ${d.emissora?.conta_corrente ?? "-"}${d.emissora?.chave_pix ? `\nPIX: ${d.emissora.chave_pix}` : ""}`;
  const obs = d.fatura?.observacoes_nota
    || "Locação de bens móveis. Não incidência de ISSQN conforme Lei Complementar 116/03.";
  const adicionais = `${bancarios}\n\n${obs}`;
  const adLines = doc.splitTextToSize(adicionais, right - M - 4);
  const adH = Math.max(20, adLines.length * 4 + 4);
  box(doc, M, y, right - M, adH);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(adLines, M + 2, y + 5);
  y += adH;

  // Rodapé recibo
  y += 4;
  const recH = 22;
  box(doc, M, y, right - M, recH);
  const rDiv = M + 50;
  doc.line(rDiv, y, rDiv, y + recH);
  label(doc, "Número da Nota", M + 2, y + 4);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(d.fatura?.numero_nf ?? "—", M + 2, y + 12);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const recTxt = `Recebi(emos) de ${d.cliente?.razao_social ?? "-"}, as locações/reembolsos constantes desta nota indicada ao lado.`;
  doc.text(doc.splitTextToSize(recTxt, right - rDiv - 4), rDiv + 2, y + 6);
  doc.line(rDiv, y + 14, right, y + 14);
  label(doc, "Data do Recebimento", rDiv + 2, y + 18);
  label(doc, "Identificação e Assinatura do Recebedor", rDiv + 60, y + 18);

  return doc;
}
