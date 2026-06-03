// Validação e formatação de CEP.

export function normalizarCEP(cep: string | null | undefined): string {
  return (cep ?? "").replace(/\D/g, "");
}

export function formatarCEP(cep: string | null | undefined): string {
  const d = normalizarCEP(cep);
  if (d.length !== 8) return cep ?? "";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function validarCEP(cep: string | null | undefined): boolean {
  return normalizarCEP(cep).length === 8;
}
