// Identificação de equipamentos: a SÉRIE/PLACA é a chave de reconhecimento.
// A TAG pode se repetir (é apenas um apelido operacional), mas repetições geram alerta.

export interface EquipRef { id: string; serie: string | null; tag: string | null }

export const normSerie = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const normTag = (s: unknown) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/** Localiza o equipamento pela série/placa; só usa a tag quando a série não foi informada. */
export function findEquipamento(list: EquipRef[], serie: string, tag: string): EquipRef | undefined {
  const s = normSerie(serie);
  const t = normTag(tag);
  if (s) {
    const bySerie = list.filter((e) => normSerie(e.serie) === s);
    return bySerie.find((e) => normTag(e.tag) === t) ?? bySerie[0];
  }
  return t ? list.find((e) => normTag(e.tag) === t) : undefined;
}

/** Alertas de tag para uma linha importada (série + tag), considerando cadastro e o próprio arquivo. */
export function alertasTag(
  list: EquipRef[],
  linhas: { serie: string; tag: string }[],
): string[][] {
  return linhas.map((l) => {
    const out: string[] = [];
    const s = normSerie(l.serie);
    const t = normTag(l.tag);
    if (!t) return out;
    const match = findEquipamento(list, l.serie, l.tag);
    if (match && normTag(match.tag) && normTag(match.tag) !== t) {
      out.push(`Tag alterada: série ${l.serie} está cadastrada com a tag "${match.tag}" (planilha: "${l.tag}")`);
    }
    const outrosCad = list.filter((e) => normTag(e.tag) === t && normSerie(e.serie) !== s);
    if (outrosCad.length) {
      out.push(`Tag "${l.tag}" repetida: já usada no cadastro pela série ${outrosCad.map((e) => e.serie || "—").join(", ")}`);
    }
    const outrosArq = linhas.filter((o) => normTag(o.tag) === t && normSerie(o.serie) !== s);
    if (outrosArq.length) {
      out.push(`Tag "${l.tag}" repetida na planilha para a série ${Array.from(new Set(outrosArq.map((o) => o.serie))).join(", ")}`);
    }
    return out;
  });
}

export const isAlertaTag = (a: string) => a.startsWith("Tag ");
