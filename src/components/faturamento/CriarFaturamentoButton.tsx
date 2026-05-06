import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Receipt, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { fmtBRL, fmtCompetencia } from "@/lib/format";

interface Props {
  medicaoId: string;
  status: string;
  valorFinal: number;
  competencia: string;
  contratoNumero?: string;
  cliente?: string;
  canCreate: boolean;
  onCreated?: () => void;
}

export function CriarFaturamentoButton({
  medicaoId, status, valorFinal, competencia, contratoNumero, cliente, canCreate, onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [faturaAtiva, setFaturaAtiva] = useState<any>(null);
  const [faturaCancelada, setFaturaCancelada] = useState<any>(null);
  const navigate = useNavigate();

  const carregar = async () => {
    const { data } = await supabase
      .from("faturas")
      .select("id,status")
      .eq("medicao_id", medicaoId)
      .order("created_at", { ascending: false });
    const ativa = (data ?? []).find((f) => f.status !== "cancelado");
    const cancelada = (data ?? []).find((f) => f.status === "cancelado");
    setFaturaAtiva(ativa ?? null);
    setFaturaCancelada(!ativa && cancelada ? cancelada : null);
  };

  useEffect(() => { if (canCreate) carregar(); }, [medicaoId, canCreate]);

  if (!canCreate) return null;

  // Já existe faturamento ativo
  if (faturaAtiva) {
    return (
      <Button size="sm" variant="outline" onClick={() => navigate(`/faturamento/${faturaAtiva.id}`)}>
        <ExternalLink className="mr-1 h-4 w-4" />Ver faturamento
      </Button>
    );
  }

  if (status !== "aprovada_cliente") return null;

  const criarNovo = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("criar_faturamento", { _medicao_id: medicaoId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Faturamento criado");
    setOpen(false);
    onCreated?.();
    if (data) navigate(`/faturamento/${data}`);
  };

  const reabrir = async () => {
    if (!faturaCancelada) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("reabrir_faturamento_cancelado" as any, { _fatura_id: faturaCancelada.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Faturamento reaberto");
    setOpen(false);
    onCreated?.();
    navigate(`/faturamento/${data ?? faturaCancelada.id}`);
  };

  const temCancelado = !!faturaCancelada;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {temCancelado ? <RefreshCw className="mr-1 h-4 w-4" /> : <Receipt className="mr-1 h-4 w-4" />}
        {temCancelado ? "Recriar faturamento" : "Criar faturamento"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{temCancelado ? "Recriar faturamento" : "Criar faturamento"}</DialogTitle>
            <DialogDescription>
              {temCancelado
                ? "Já existe um faturamento cancelado para esta medição. Você pode reabrir o faturamento cancelado ou criar um novo, mantendo o anterior no histórico."
                : <>Será criado um faturamento vinculado a esta medição. O status da medição mudará para <strong>Faturada</strong>.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="font-medium">{cliente ?? "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Contrato</span><span className="font-mono">{contratoNumero ?? "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Competência</span><span className="num">{fmtCompetencia(competencia)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Valor aprovado</span><span className="num font-bold text-primary">{fmtBRL(valorFinal)}</span></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            {temCancelado && (
              <Button variant="secondary" onClick={reabrir} disabled={busy}>
                {busy ? "Reabrindo…" : "Reabrir cancelado"}
              </Button>
            )}
            <Button onClick={criarNovo} disabled={busy}>{busy ? "Criando…" : (temCancelado ? "Criar novo" : "Confirmar criação")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
