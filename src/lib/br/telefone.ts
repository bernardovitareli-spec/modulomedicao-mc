// Validação e formatação de telefones brasileiros (fixo e celular).

export function normalizarTelefone(tel: string | null | undefined): string {
  return (tel ?? "").replace(/\D/g, "");
}

export function validarTelefone(tel: string | null | undefined): boolean {
  const d = normalizarTelefone(tel);
  // 10 dígitos (fixo: DDD + 8) ou 11 (celular: DDD + 9XXXXXXXX)
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

export function formatarTelefone(tel: string | null | undefined): string {
  const d = normalizarTelefone(tel);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel ?? "";
}
