import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  message?: string;
  confirmWord?: string;
  loading?: boolean;
  onConfirm: (motivo: string) => Promise<void> | void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title = "Confirmar exclusão",
  message = "Tem certeza que deseja excluir esta medição? Esta ação removerá todos os itens da medição e não poderá ser desfeita.",
  confirmWord = "EXCLUIR",
  loading,
  onConfirm,
}: Props) {
  const [motivo, setMotivo] = useState("");
  const [palavra, setPalavra] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const reset = () => { setMotivo(""); setPalavra(""); setStep(1); };
  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o); };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> {title}
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            <div>
              <Label>Motivo da exclusão *</Label>
              <Textarea
                placeholder="Informe o motivo (mínimo 3 caracteres)"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">
              Para confirmar, digite <strong className="font-mono">{confirmWord}</strong> abaixo:
            </p>
            <Input
              autoFocus
              value={palavra}
              onChange={(e) => setPalavra(e.target.value)}
              placeholder={confirmWord}
              className="font-mono"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={loading}>
            Cancelar
          </Button>
          {step === 1 ? (
            <Button
              variant="destructive"
              disabled={motivo.trim().length < 3}
              onClick={() => setStep(2)}
            >
              Continuar
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={palavra !== confirmWord || loading}
              onClick={async () => { await onConfirm(motivo.trim()); reset(); }}
            >
              {loading ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
