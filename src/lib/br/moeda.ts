// Parsing e formatação de valores monetários no padrão pt-BR.

export function parseValorBR(s: string | number | null | undefined): number {
  if (s == null || s === "") return 0;
  if (typeof s === "number") return s;
  const limpo = s
    .toString()
    .trim()
    .replace(/[R$\s]/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // remove pontos de milhar
    .replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

export function formatarValorBR(n: number | null | undefined, digitos = 2): string {
  if (n == null || !Number.isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digitos, maximumFractionDigits: digitos });
}

export function formatarMoedaBR(n: number | null | undefined): string {
  return `R$ ${formatarValorBR(n)}`;
}
