import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, History, FilePlus2, X, Loader2, Star, FileText } from "lucide-react";
import { fmtBRL, fmtDate, fmtCompetencia } from "@/lib/format";
import { labelStatus } from "@/lib/medicaoStatus";

export interface ConflitoMedicao {
  chave: string;
  cliente: string;
  contratoNumero: string;
  competencia: string;
  periodoInicio: string;
  periodoFim: string;
  medicaoExistente: {
    id: string;
    status: string;
    valor_final: number;
    versao: number;
    updated_at: string;
    user_email?: string | null;
    motivo_cancelamento?: string | null;
    arquivo_origem?: string | null;
  };
  valorNovo: number;
  arquivoNovo?: string | null;
}

export type ConflitoDecisao = "reabrir" | "nova_versao" | "cancelar";

export interface ConflitoResolucao {
  chave: string;
  decisao: ConflitoDecisao;
  motivo: string;
  arquivoOrigem?: string | null;
}

interface Props {
  open: boolean;
  conflitos: ConflitoMedicao[];
  onResolve: (resolucoes: ConflitoResolucao[]) => Promise<void> | void;
  onCancel: () => void;
}

const SUGESTAO_REIMPORT = "Reimportação devido à correção do arquivo base de medição.";

export function ImportConflitoDialog({ open, conflitos, onResolve, onCancel }: Props) {
  const [decisoes, setDecisoes] = useState<Record<string, ConflitoDecisao>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Pré-selecionar "nova_versao" (recomendada) e sugerir motivo
  useEffect(() => {
    if (!open) return;
    const dec: Record<string, ConflitoDecisao> = {};
    const mot: Record<string, string> = {};
    for (const c of conflitos) {
      dec[c.chave] = "nova_versao";
      mot[c.chave] = SUGESTAO_REIMPORT;
    }
    setDecisoes(dec);
    setMotivos(mot);
  }, [open, conflitos]);

  const handleConfirm = async () => {
    for (const c of conflitos) {
      const d = decisoes[c.chave];
      if (!d) return;
      if (d !== "cancelar" && (motivos[c.chave] ?? "").trim().length < 5) return;
    }
    setBusy(true);
    try {
      await onResolve(
        conflitos.map((c) => ({
          chave: c.chave,
          decisao: decisoes[c.chave],
          motivo: motivos[c.chave] ?? "",
          arquivoOrigem: c.arquivoNovo ?? null,
        })),
      );
    } finally {
      setBusy(false);
    }
  };

  const todasDecididas = conflitos.every((c) => {
    const d = decisoes[c.chave];
    if (!d) return false;
    if (d !== "cancelar" && (motivos[c.chave] ?? "").trim().length < 5) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Conflito de importação — medição já existente
          </DialogTitle>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Já existe uma medição para este contrato, competência e período. Escolha como proceder
            para cada conflito antes de prosseguir com a importação. A opção <strong>Criar nova versão</strong> é
            a recomendada para reimportação de arquivo corrigido.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          {conflitos.map((c) => {
            const ex = c.medicaoExistente;
            const isCancelada = ex.status === "cancelada";
            const decisao = decisoes[c.chave];
            return (
              <div key={c.chave} className="rounded-md border p-3 space-y-3">
                <div className="grid gap-2 md:grid-cols-2 text-xs">
                  <div><span className="text-muted-foreground">Cliente:</span> <strong>{c.cliente}</strong></div>
                  <div><span className="text-muted-foreground">Contrato:</span> <span className="font-mono">{c.contratoNumero}</span></div>
                  <div><span className="text-muted-foreground">Competência:</span> {fmtCompetencia(c.competencia)}</div>
                  <div><span className="text-muted-foreground">Período:</span> {fmtDate(c.periodoInicio)} → {fmtDate(c.periodoFim)}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status atual:</span>
                    <Badge variant={isCancelada ? "destructive" : "secondary"}>{labelStatus(ex.status)}</Badge>
                    <Badge variant="outline">v{ex.versao}</Badge>
                  </div>
                  <div><span className="text-muted-foreground">Última alteração:</span> {fmtDate(ex.updated_at)}</div>
                  <div><span className="text-muted-foreground">Valor atual:</span> <span className="num font-semibold">{fmtBRL(ex.valor_final)}</span></div>
                  <div><span className="text-muted-foreground">Valor da nova importação:</span> <span className="num font-semibold text-primary">{fmtBRL(c.valorNovo)}</span></div>
                  {ex.arquivo_origem && (
                    <div className="md:col-span-2 flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Arquivo anterior:</span>
                      <span className="font-mono">{ex.arquivo_origem}</span>
                    </div>
                  )}
                  {c.arquivoNovo && (
                    <div className="md:col-span-2 flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-primary" />
                      <span className="text-muted-foreground">Novo arquivo:</span>
                      <span className="font-mono text-primary">{c.arquivoNovo}</span>
                    </div>
                  )}
                  {ex.user_email && (
                    <div className="md:col-span-2"><span className="text-muted-foreground">{isCancelada ? "Cancelada por:" : "Última atualização por:"}</span> {ex.user_email}</div>
                  )}
                  {isCancelada && ex.motivo_cancelamento && (
                    <div className="md:col-span-2"><span className="text-muted-foreground">Motivo do cancelamento:</span> <em>{ex.motivo_cancelamento}</em></div>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Escolha uma ação *</Label>
                  <RadioGroup
                    value={decisao ?? ""}
                    onValueChange={(v) => setDecisoes((p) => ({ ...p, [c.chave]: v as ConflitoDecisao }))}
                    className="mt-1.5 space-y-1.5"
                  >
                    <label className={`flex items-start gap-2 text-xs cursor-pointer rounded-md p-2 border ${decisao === "nova_versao" ? "border-primary bg-primary/5" : "border-transparent"}`}>
                      <RadioGroupItem value="nova_versao" className="mt-0.5" />
                      <span>
                        <strong className="flex items-center gap-1">
                          <FilePlus2 className="h-3 w-3" />Criar nova versão da medição
                          <Badge variant="default" className="ml-1 h-4 text-[9px] gap-0.5"><Star className="h-2.5 w-2.5" />Recomendada</Badge>
                        </strong>
                        <span className="block text-muted-foreground">
                          Mantém a medição anterior (v{ex.versao}) no histórico como inativa. Cria nova medição v{ex.versao + 1} como Rascunho com os dados importados.
                        </span>
                      </span>
                    </label>
                    {isCancelada && (
                      <label className="flex items-start gap-2 text-xs cursor-pointer rounded-md p-2">
                        <RadioGroupItem value="reabrir" className="mt-0.5" />
                        <span>
                          <strong className="flex items-center gap-1"><History className="h-3 w-3" />Reabrir medição cancelada e substituir dados</strong>
                          <span className="block text-muted-foreground">
                            Status volta para Rascunho. Itens são substituídos pela nova importação. Recalcula totais. Histórico é registrado.
                          </span>
                        </span>
                      </label>
                    )}
                    <label className="flex items-start gap-2 text-xs cursor-pointer rounded-md p-2">
                      <RadioGroupItem value="cancelar" className="mt-0.5" />
                      <span>
                        <strong className="flex items-center gap-1"><X className="h-3 w-3" />Cancelar importação deste item</strong>
                        <span className="block text-muted-foreground">Não altera nada. As linhas desse contrato/competência serão ignoradas.</span>
                      </span>
                    </label>
                  </RadioGroup>
                </div>

                {decisao && decisao !== "cancelar" && (
                  <div>
                    <Label className="text-xs">Motivo * (mínimo 5 caracteres)</Label>
                    <Textarea
                      rows={2}
                      value={motivos[c.chave] ?? ""}
                      onChange={(e) => setMotivos((p) => ({ ...p, [c.chave]: e.target.value }))}
                      placeholder={decisao === "reabrir" ? "Motivo da reabertura" : "Motivo da nova versão (ex.: arquivo corrigido)"}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancelar importação</Button>
          <Button onClick={handleConfirm} disabled={!todasDecididas || busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Aplicar decisões e importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
