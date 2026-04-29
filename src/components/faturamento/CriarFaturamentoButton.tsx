import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
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
  const navigate = useNavigate();

  if (!canCreate || status !== "aprovada_cliente") return null;

  const criar = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("criar_faturamento", { _medicao_id: medicaoId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Faturamento criado");
    setOpen(false);
    onCreated?.();
    if (data) navigate(`/faturamento/${data}`);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Receipt className="mr-1 h-4 w-4" />Criar faturamento
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar faturamento</DialogTitle>
            <DialogDescription>
              Será criado um faturamento vinculado a esta medição. O status da medição mudará para <strong>Faturada</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="font-medium">{cliente ?? "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Contrato</span><span className="font-mono">{contratoNumero ?? "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Competência</span><span className="num">{fmtCompetencia(competencia)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Valor aprovado</span><span className="num font-bold text-primary">{fmtBRL(valorFinal)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={criar} disabled={busy}>{busy ? "Criando…" : "Confirmar criação"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
