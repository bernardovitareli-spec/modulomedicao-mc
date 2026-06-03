// Validação e formatação de CPF (algoritmo oficial).

export function normalizarCPF(cpf: string | null | undefined): string {
  return (cpf ?? "").replace(/\D/g, "");
}

export function formatarCPF(cpf: string | null | undefined): string {
  const d = normalizarCPF(cpf).padStart(11, "0").slice(-11);
  if (!d || d.length !== 11) return cpf ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function validarCPF(cpf: string | null | undefined): boolean {
  const d = normalizarCPF(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1+$/.test(d)) return false;

  const calc = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };

  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
