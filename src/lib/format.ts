export const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export const fmtNum = (v: number | null | undefined, digits = 2) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(v ?? 0));

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return date.toLocaleDateString("pt-BR");
};

export const fmtCNPJ = (cnpj: string) => {
  const c = cnpj.replace(/\D/g, "").padStart(14, "0").slice(0, 14);
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

export const monthKey = (d: Date | string) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Formata competência para exibição: "Abril/2026".
 * Aceita "YYYY-MM", "YYYY-MM-DD" ou Date. Armazenamento permanece YYYY-MM(-DD).
 */
export const fmtCompetencia = (v: string | Date | null | undefined) => {
  if (!v) return "-";
  let year: number;
  let monthIdx: number;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})/);
    if (!m) return v;
    year = Number(m[1]);
    monthIdx = Number(m[2]) - 1;
  } else {
    year = v.getFullYear();
    monthIdx = v.getMonth();
  }
  if (monthIdx < 0 || monthIdx > 11) return String(v);
  return `${MESES_PT[monthIdx]}/${year}`;
};
