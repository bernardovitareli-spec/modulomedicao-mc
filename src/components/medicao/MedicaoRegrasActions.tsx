import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Calculator, CheckCircle2, Loader2, Sparkles } from "lucide-react";
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

  const podeAplicar = !STATUS_BLOQUEIA_APLICACAO.includes(status);

  const simular = async () => {
    setLoading(true); setResultado(null);
    const { data, error } = await supabase.rpc("simular_regras_medicao", { _medicao_id: medicaoId } as any);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setResultado(data);
    setOpen(true);
  };

  const aplicar = async () => {
    if (!podeAplicar) { toast.error("Status atual permite apenas simulação"); return; }
    if (motivo.trim().length < 5) { toast.error("Informe um motivo (mínimo 5 caracteres)"); return; }
    setAplicando(true);
    const { error } = await supabase.rpc("aplicar_regras_medicao", { _medicao_id: medicaoId, _motivo: motivo.trim() } as any);
    setAplicando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Regras aplicadas e medição recalculada");
    setOpen(false); setMotivo(""); setResultado(null);
    onApplied?.();
  };

  const itens: any[] = resultado?.itens ?? [];
  const totalAtual = Number(resultado?.total_atual ?? 0);
  const totalNovo = Number(resultado?.total_recalculado ?? 0);
  const diff = Number(resultado?.diferenca ?? 0);

  return (
    <>
      <Button size="sm" variant="outline" onClick={simular} disabled={loading}>
        {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Calculator className="mr-1 h-4 w-4" />}
        Simular regras contratuais
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
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

          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="Valor atual" value={fmtBRL(totalAtual)} />
            <Stat label="Valor recalculado" value={fmtBRL(totalNovo)} highlight />
            <Stat label="Diferença" value={fmtBRL(diff)} highlight={Math.abs(diff) > 0.01} />
          </div>

          <div className="max-h-[420px] overflow-auto border rounded-md">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Equipamento</TableHead>
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
                  return (
                    <TableRow key={it.item_id}>
                      <TableCell className="font-mono text-xs">{it.equipamento_id?.slice(0, 8) ?? "—"}…</TableCell>
                      <TableCell className="text-right num">{fmtBRL(it.valor_atual)}</TableCell>
                      <TableCell className="text-right num font-medium">{fmtBRL(it.valor_recalculado)}</TableCell>
                      <TableCell className={`text-right num ${Math.abs(d) > 0.01 ? "text-primary font-semibold" : "text-muted-foreground"}`}>{fmtBRL(d)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {regras.length === 0 && <span className="text-xs text-muted-foreground">— sem regras vigentes —</span>}
                          {regras.map((r: any, j: number) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">{labelTipo(r.tipo)}</Badge>
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
            <div>
              <Label className="text-xs">Motivo da aplicação *</Label>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo da aplicação das regras (mínimo 5 caracteres)" rows={2} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
            {podeAplicar && (
              <Button onClick={aplicar} disabled={aplicando || motivo.trim().length < 5}>
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
