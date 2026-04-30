import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/contrato/ContratoMedicoesTab";
import { fmtBRL, fmtDate, fmtNum } from "@/lib/format";
import { GitCompare, Eye, ArrowRight } from "lucide-react";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  medicaoId: string;
}

export function MedicaoVersoesTab({ medicaoId }: Props) {
  const navigate = useNavigate();
  const perms = usePermissions();
  const { user } = useAuth();
  const [versoes, setVersoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);
  const [vA, setVA] = useState<string>("");
  const [vB, setVB] = useState<string>("");
  const [comparison, setComparison] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Pega medição atual para descobrir a cadeia
      const { data: cur } = await supabase
        .from("medicoes")
        .select("id, medicao_original_id, contrato_id, competencia, periodo_inicio, periodo_fim, created_by")
        .eq("id", medicaoId)
        .single();
      if (!cur) { setLoading(false); return; }

      const original = (cur as any).medicao_original_id ?? cur.id;

      // Permissão: operacional só vê suas próprias
      const isOperacionalOnly = perms.isOperacional && !perms.isAdmin && !perms.isGestor;

      let query = supabase
        .from("medicoes")
        .select(`
          *,
          contratos(numero_dj, clientes(razao_social)),
          medicao_itens(id)
        `)
        .or(`id.eq.${original},medicao_original_id.eq.${original}`)
        .order("versao", { ascending: false });

      if (isOperacionalOnly && user?.id) {
        query = query.eq("created_by", user.id);
      }

      const { data } = await query;
      const enriched = (data ?? []).map((v: any) => ({
        ...v,
        qtd_itens: v.medicao_itens?.length ?? 0,
      }));

      // Buscar usuários responsáveis
      const userIds = [...new Set(enriched.map((v) => v.created_by).filter(Boolean))];
      const userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: hist } = await supabase
          .from("medicao_status_historico")
          .select("user_id, user_email")
          .in("user_id", userIds);
        (hist ?? []).forEach((h: any) => { if (h.user_id && h.user_email) userMap[h.user_id] = h.user_email; });
      }

      const final = enriched.map((v: any) => ({
        ...v,
        user_email: v.created_by ? userMap[v.created_by] ?? "—" : "—",
      }));

      setVersoes(final);
      if (final.length >= 2) {
        setVA(final[1].id);
        setVB(final[0].id);
      }
      setLoading(false);
    })();
  }, [medicaoId, user?.id]);

  const versoesOrdenadas = useMemo(
    () => [...versoes].sort((a, b) => (a.versao ?? 1) - (b.versao ?? 1)),
    [versoes]
  );

  const diffValor = (v: any, idx: number) => {
    if (idx === 0) return null;
    const ant = versoesOrdenadas[idx - 1];
    return Number(v.valor_final ?? 0) - Number(ant.valor_final ?? 0);
  };

  const compararVersoes = async () => {
    if (!vA || !vB) return;
    const [{ data: mA }, { data: mB }] = await Promise.all([
      supabase.from("medicoes").select("*, medicao_itens(*, equipamentos(tag, serie))").eq("id", vA).single(),
      supabase.from("medicoes").select("*, medicao_itens(*, equipamentos(tag, serie))").eq("id", vB).single(),
    ]);
    if (!mA || !mB) return;

    const itensA: any[] = (mA as any).medicao_itens ?? [];
    const itensB: any[] = (mB as any).medicao_itens ?? [];

    const keyOf = (it: any) => `${it.equipamento_id}|${it.periodo_inicio}|${it.periodo_fim}`;
    const mapA = new Map(itensA.map((i) => [keyOf(i), i]));
    const mapB = new Map(itensB.map((i) => [keyOf(i), i]));

    const adicionados: any[] = [];
    const removidos: any[] = [];
    const alterados: any[] = [];

    for (const [k, ib] of mapB) {
      if (!mapA.has(k)) adicionados.push(ib);
      else {
        const ia = mapA.get(k)!;
        if (Number(ia.valor_final) !== Number(ib.valor_final) ||
            Number(ia.horas_a_pagar) !== Number(ib.horas_a_pagar)) {
          alterados.push({ antes: ia, depois: ib });
        }
      }
    }
    for (const [k, ia] of mapA) {
      if (!mapB.has(k)) removidos.push(ia);
    }

    setComparison({
      mA, mB,
      adicionados, removidos, alterados,
      diffValor: Number(mB.valor_final ?? 0) - Number(mA.valor_final ?? 0),
      diffHoras: Number(mB.total_horas_pagar ?? 0) - Number(mA.total_horas_pagar ?? 0),
    });
  };

  if (loading) return <div className="text-sm text-muted-foreground p-4">Carregando versões...</div>;

  if (versoes.length === 0) {
    return <div className="text-sm text-muted-foreground p-4">Nenhuma versão visível.</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold">Histórico de versões</h3>
              <p className="text-xs text-muted-foreground">
                {versoes.length} versão(ões) — apenas a versão ativa entra em faturamento, dashboard e relatórios.
              </p>
            </div>
            {versoes.length >= 2 && (
              <Button size="sm" variant="outline" onClick={() => { compararVersoes(); setCompareOpen(true); }}>
                <GitCompare className="mr-1 h-4 w-4" />Comparar versões
              </Button>
            )}
          </div>

          {versoes.length >= 2 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border p-2 bg-muted/30">
              <span className="text-xs text-muted-foreground">Comparar:</span>
              <Select value={vA} onValueChange={setVA}>
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {versoesOrdenadas.map((v) => <SelectItem key={v.id} value={v.id}>v{v.versao}</SelectItem>)}
                </SelectContent>
              </Select>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Select value={vB} onValueChange={setVB}>
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {versoesOrdenadas.map((v) => <SelectItem key={v.id} value={v.id}>v{v.versao}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => { compararVersoes(); setCompareOpen(true); }} disabled={!vA || !vB || vA === vB}>
                Comparar
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Versão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cliente / Contrato</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Horas inf.</TableHead>
                  <TableHead className="text-right">Horas pagar</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Δ Valor</TableHead>
                  <TableHead>Arquivo origem</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Importação</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versoesOrdenadas.slice().reverse().map((v) => {
                  const idxAsc = versoesOrdenadas.findIndex((x) => x.id === v.id);
                  const diff = diffValor(v, idxAsc);
                  const motivo = v.motivo_reimportacao || v.motivo_substituicao || v.motivo_reabertura || "—";
                  return (
                    <TableRow key={v.id} className={v.id === medicaoId ? "bg-muted/40" : ""}>
                      <TableCell className="font-mono">v{v.versao}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={v.status} />
                          {v.ativa ? (
                            <Badge variant="default" className="text-[10px] w-fit">ativa</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] w-fit">inativa</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{v.contratos?.clientes?.razao_social ?? "—"}</div>
                        <div className="text-muted-foreground font-mono">{v.contratos?.numero_dj ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {fmtDate(v.periodo_inicio)} → {fmtDate(v.periodo_fim)}
                      </TableCell>
                      <TableCell className="text-right num text-xs">{fmtNum(v.total_horas_informadas)}</TableCell>
                      <TableCell className="text-right num text-xs">{fmtNum(v.total_horas_pagar)}</TableCell>
                      <TableCell className="text-right num font-semibold">{fmtBRL(v.valor_final)}</TableCell>
                      <TableCell className="text-right num text-xs">
                        {diff === null ? "—" : (
                          <span className={diff > 0 ? "text-emerald-600" : diff < 0 ? "text-destructive" : ""}>
                            {diff > 0 ? "+" : ""}{fmtBRL(diff)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate" title={v.arquivo_origem ?? ""}>
                        {v.arquivo_origem ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{v.user_email}</TableCell>
                      <TableCell className="text-xs">{fmtDate(v.created_at)}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={motivo}>{motivo}</TableCell>
                      <TableCell>
                        {v.id !== medicaoId && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/medicoes/${v.id}`)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comparação de versões</DialogTitle>
          </DialogHeader>
          {comparison && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Versão A</p>
                  <p className="font-mono text-sm">v{comparison.mA.versao} — {fmtDate(comparison.mA.created_at)}</p>
                  <p className="text-sm mt-1">{fmtBRL(comparison.mA.valor_final)} — {fmtNum(comparison.mA.total_horas_pagar)} h</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Versão B</p>
                  <p className="font-mono text-sm">v{comparison.mB.versao} — {fmtDate(comparison.mB.created_at)}</p>
                  <p className="text-sm mt-1">{fmtBRL(comparison.mB.valor_final)} — {fmtNum(comparison.mB.total_horas_pagar)} h</p>
                </CardContent></Card>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Kpi l="Δ Valor" v={`${comparison.diffValor > 0 ? "+" : ""}${fmtBRL(comparison.diffValor)}`} accent={comparison.diffValor !== 0} />
                <Kpi l="Δ Horas a pagar" v={`${comparison.diffHoras > 0 ? "+" : ""}${fmtNum(comparison.diffHoras)}`} />
                <Kpi l="Itens alterados" v={String(comparison.alterados.length)} />
              </div>

              <Section title={`Itens adicionados (${comparison.adicionados.length})`}>
                {comparison.adicionados.length === 0 ? <Empty /> : comparison.adicionados.map((i: any) => (
                  <ItemRow key={i.id} eq={i.equipamentos} valor={i.valor_final} horas={i.horas_a_pagar} kind="add" />
                ))}
              </Section>

              <Section title={`Itens removidos (${comparison.removidos.length})`}>
                {comparison.removidos.length === 0 ? <Empty /> : comparison.removidos.map((i: any) => (
                  <ItemRow key={i.id} eq={i.equipamentos} valor={i.valor_final} horas={i.horas_a_pagar} kind="remove" />
                ))}
              </Section>

              <Section title={`Itens alterados (${comparison.alterados.length})`}>
                {comparison.alterados.length === 0 ? <Empty /> : comparison.alterados.map((p: any) => {
                  const dv = Number(p.depois.valor_final) - Number(p.antes.valor_final);
                  const dh = Number(p.depois.horas_a_pagar) - Number(p.antes.horas_a_pagar);
                  return (
                    <div key={p.depois.id} className="rounded-md border p-2 text-xs space-y-1">
                      <div className="font-mono font-medium">{p.depois.equipamentos?.tag ?? "—"} ({p.depois.equipamentos?.serie ?? "—"})</div>
                      <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                        <span>Valor: {fmtBRL(p.antes.valor_final)} → {fmtBRL(p.depois.valor_final)} <span className={dv > 0 ? "text-emerald-600" : "text-destructive"}>({dv > 0 ? "+" : ""}{fmtBRL(dv)})</span></span>
                        <span>Horas: {fmtNum(p.antes.horas_a_pagar)} → {fmtNum(p.depois.horas_a_pagar)} <span className={dh > 0 ? "text-emerald-600" : "text-destructive"}>({dh > 0 ? "+" : ""}{fmtNum(dh)})</span></span>
                      </div>
                    </div>
                  );
                })}
              </Section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return <Card><CardContent className="p-2"><p className="text-[10px] text-muted-foreground">{l}</p><p className={`text-sm font-semibold num ${accent ? "text-primary" : ""}`}>{v}</p></CardContent></Card>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Empty() { return <p className="text-xs text-muted-foreground italic">Nenhum item.</p>; }
function ItemRow({ eq, valor, horas, kind }: any) {
  const color = kind === "add" ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5";
  return (
    <div className={`rounded-md border p-2 text-xs flex items-center justify-between ${color}`}>
      <span className="font-mono">{eq?.tag ?? "—"} ({eq?.serie ?? "—"})</span>
      <span>{fmtNum(horas)} h — {fmtBRL(valor)}</span>
    </div>
  );
}
