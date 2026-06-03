// Helpers de data no padrão pt-BR.

export function parseData(s: string | Date | null | undefined): Date | null {
  if (!s) return null;
  if (s instanceof Date) return Number.isNaN(s.getTime()) ? null : s;
  const v = s.trim();
  // dd/mm/aaaa
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // yyyy-mm-dd
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatarData(d: Date | string | null | undefined): string {
  const dt = d instanceof Date ? d : parseData(d ?? null);
  if (!dt) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

export function isoData(d: Date | string | null | undefined): string {
  const dt = d instanceof Date ? d : parseData(d ?? null);
  if (!dt) return "";
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
