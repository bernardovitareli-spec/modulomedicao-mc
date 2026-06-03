// Validação e formatação de CNPJ (algoritmo oficial Receita Federal).

export function normalizarCNPJ(cnpj: string | null | undefined): string {
  return (cnpj ?? "").replace(/\D/g, "");
}

export function formatarCNPJ(cnpj: string | null | undefined): string {
  const d = normalizarCNPJ(cnpj).padStart(14, "0").slice(-14);
  if (!d || d.length !== 14) return cnpj ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function validarCNPJ(cnpj: string | null | undefined): boolean {
  const d = normalizarCNPJ(cnpj);
  if (d.length !== 14) return false;
  if (/^(\d)\1+$/.test(d)) return false;

  const calc = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const dv1 = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calc(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return dv1 === Number(d[12]) && dv2 === Number(d[13]);
}
