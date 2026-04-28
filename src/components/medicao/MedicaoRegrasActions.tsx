import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, AlertTriangle, Calculator, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL } from "@/lib/format";
import { labelTipo } from "@/lib/regras";

const STATUS_BLOQUEIA_APLICACAO = ["revisao_tecnica", "aprovacao_gerencial", "aprovada", "faturada", "paga"];

interface Props {
  medicaoId: string;
  status: string;
  onApplied?: () => void;
}

export default function MedicaoRegrasActions({ medicaoId, status, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [motivo, setMotivo] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [confirmaMultiplos, setConfirmaMultiplos] = useState(false);

  const podeAplicar = !STATUS_BLOQUEIA_APLICACAO.includes(status);

  const simular = async () => {
    setLoading(true); setResultado(null); setConfirmaMultiplos(false);
    const { data, error } = await supabase.rpc("simular_regras_medicao", { _medicao_id: medicaoId } as any);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setResultado(data);
    setOpen(true);
  };

  const itens: any[] = resultado?.itens ?? [];
  const totalAtual = Number(resultado?.total_atual ?? 0);
  const totalNovo = Number(resultado?.total_recalculado ?? 0);
  const diff = Number(resultado?.diferenca ?? 0);
  const stats = resultado?.estatisticas ?? {};
  const alertas: any[] = resultado?.alertas ?? [];

  // Detecta se uma única regra específica está afetando >1 equipamento (precisa confirmação)
  const regraEspecificaIds = new Map<string, Set<string>>();
  itens.forEach((it: any) => {
    const d = Number(it.diferenca ?? 0);
    if (Math.abs(d) <= 0.01) return;
    (it.regras_aplicadas ?? []).forEach((r: any) => {
      if (r.origem === "equipamento" && r.regra_id) {
        if (!regraEspecificaIds.has(r.regra_id)) regraEspecificaIds.set(r.regra_id, new Set());
        regraEspecificaIds.get(r.regra_id)!.add(it.equipamento_id);
      }
    });
  });
  const regraMultiEq = Array.from(regraEspecificaIds.values()).some((s) => s.size > 1);

  const aplicar = async () => {
    if (!podeAplicar) { toast.error("Status atual permite apenas simulação"); return; }
    if (motivo.trim().length < 5) { toast.error("Informe um motivo (mínimo 5 caracteres)"); return; }
    if (regraMultiEq && !confirmaMultiplos) {
      toast.error("Confirme explicitamente a aplicação de regra específica em múltiplos equipamentos");
      return;
    }
    setAplicando(true);
    const { error } = await supabase.rpc("aplicar_regras_medicao", { _medicao_id: medicaoId, _motivo: motivo.trim() } as any);
    setAplicando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Regras aplicadas e medição recalculada");
    setOpen(false); setMotivo(""); setResultado(null); setConfirmaMultiplos(false);
    onApplied?.();
  };

  const eqLabel = (it: any) => {
    const parts = [it.equipamento_serie, it.equipamento_tag, it.equipamento_tipo, it.equipamento_modelo].filter(Boolean);
    return parts.length ? parts.join(" | ") : "—";
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={simular} disabled={loading}>
        {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Calculator className="mr-1 h-4 w-4" />}
        Simular regras contratuais
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Prévia da aplicação de regras contratuais
            </DialogTitle>
          </DialogHeader>

          {!podeAplicar && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Medição em status <strong>{status}</strong> não permite aplicação de regras. Apenas simulação está disponível.
              </AlertDescription>
            </Alert>
          )}

          {/* Estatísticas de regras */}
          <div className="grid gap-2 md:grid-cols-4">
            <MiniStat label="Regras encontradas" value={String(stats.total_regras ?? 0)} />
            <MiniStat label="Aplicáveis ao período" value={String(stats.regras_aplicaveis ?? 0)} />
            <MiniStat label="Equipamentos afetados" value={String(stats.equipamentos_afetados ?? 0)} highlight />
            <MiniStat label="Equipamentos não afetados" value={String(stats.equipamentos_nao_afetados ?? 0)} />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <MiniStat label="Regras gerais" value={String(stats.regras_gerais ?? 0)} />
            <MiniStat label="Por tipo de equipamento" value={String(stats.regras_por_tipo ?? 0)} />
            <MiniStat label="Por equipamento específico" value={String(stats.regras_por_equipamento ?? 0)} />
          </div>

          {/* Totais */}
          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="Valor atual" value={fmtBRL(totalAtual)} />
            <Stat label="Valor recalculado" value={fmtBRL(totalNovo)} highlight />
            <Stat label="Diferença" value={fmtBRL(diff)} highlight={Math.abs(diff) > 0.01} />
          </div>

          {/* Alertas */}
          {alertas.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs space-y-1">
                {alertas.map((a, i) => (
                  <div key={i}>
                    <strong>{labelTipo(a.regra_tipo)}</strong>{" "}
                    {a.tipo === "regra_sem_equipamento" && (
                      <>— equipamento <span className="font-mono">{a.equipamento_serie ?? "?"} / {a.equipamento_tag ?? "?"}</span>: {a.mensagem}</>
                    )}
                    {a.tipo === "regra_sem_tipo" && (
                      <>— tipo <span className="font-mono">{a.tipo_equipamento ?? "?"}</span>: {a.mensagem}</>
                    )}
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {regraMultiEq && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Uma regra específica de equipamento está afetando <strong>mais de um equipamento</strong>.
                Marque a confirmação para liberar a aplicação.
              </AlertDescription>
            </Alert>
          )}

          <div className="max-h-[420px] overflow-auto border rounded-md">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="min-w-[280px]">Equipamento</TableHead>
                <TableHead className="text-right">Valor atual</TableHead>
                <TableHead className="text-right">Valor recalculado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead>Regras aplicadas</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {itens.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">Sem itens.</TableCell></TableRow>}
                {itens.map((it: any) => {
                  const d = Number(it.diferenca ?? 0);
                  const regras: any[] = it.regras_aplicadas ?? [];
                  const escopoLabel = (r: any) =>
                    r.origem === "equipamento" ? "Equipamento específico"
                    : r.origem === "tipo_equipamento" ? `Tipo — ${r.tipo_equipamento ?? ""}`
                    : "Geral do contrato";
                  const badgeVariant = (origem: string) =>
                    origem === "equipamento" ? "default" : origem === "tipo_equipamento" ? "outline" : "secondary";
                  return (
                    <TableRow key={it.item_id}>
                      <TableCell className="text-xs">{eqLabel(it)}</TableCell>
                      <TableCell className="text-right num">{fmtBRL(it.valor_atual)}</TableCell>
                      <TableCell className="text-right num font-medium">{fmtBRL(it.valor_recalculado)}</TableCell>
                      <TableCell className={`text-right num ${Math.abs(d) > 0.01 ? "text-primary font-semibold" : "text-muted-foreground"}`}>{fmtBRL(d)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {regras.length === 0 && <span className="text-xs text-muted-foreground">— sem regra aplicada —</span>}
                          {regras.map((r: any, j: number) => (
                            <div key={j} className="flex flex-wrap items-center gap-1">
                              <Badge variant={badgeVariant(r.origem) as any} className="text-[10px]">{labelTipo(r.tipo)}</Badge>
                              <span className="text-[10px] text-muted-foreground">{escopoLabel(r)}</span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {podeAplicar && (
            <>
              <div>
                <Label className="text-xs">Motivo da aplicação *</Label>
                <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Descreva o motivo da aplicação das regras (mínimo 5 caracteres)" rows={2} />
              </div>
              {regraMultiEq && (
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <Checkbox checked={confirmaMultiplos} onCheckedChange={(v) => setConfirmaMultiplos(!!v)} />
                  <span>Confirmo que a regra específica deve ser aplicada a múltiplos equipamentos.</span>
                </label>
              )}
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
            {podeAplicar && (
              <Button onClick={aplicar} disabled={aplicando || motivo.trim().length < 5 || (regraMultiEq && !confirmaMultiplos)}>
                {aplicando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                Aplicar regras contratuais
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold num ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
