import { useState, ReactNode } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CampoConfig {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea";
  required?: boolean;
  placeholder?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  campos?: CampoConfig[];
  motivoObrigatorio?: boolean;
  motivoLabel?: string;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: (values: Record<string, string>) => Promise<void> | void;
  children?: ReactNode;
}

export function AcaoMedicaoDialog({
  open, onOpenChange, title, description,
  campos = [], motivoObrigatorio = false, motivoLabel = "Motivo *",
  confirmLabel = "Confirmar", variant = "default", onConfirm, children,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setValues({}); setMotivo(""); setObs(""); setBusy(false); };

  const handle = async () => {
    if (motivoObrigatorio && motivo.trim().length < 5) {
      toast.error("Motivo obrigatório (mínimo 5 caracteres)");
      return;
    }
    for (const c of campos) {
      if (c.required && !String(values[c.name] ?? "").trim()) {
        toast.error(`${c.label} é obrigatório`);
        return;
      }
    }
    setBusy(true);
    try {
      await onConfirm({ ...values, _motivo: motivo, _observacoes: obs });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Falha na operação");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </DialogHeader>
        <div className="space-y-3">
          {campos.map((c) => (
            <div key={c.name}>
              <Label className="text-xs">{c.label}{c.required ? " *" : ""}</Label>
              {c.type === "textarea" ? (
                <Textarea
                  value={values[c.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                  placeholder={c.placeholder}
                  rows={2}
                />
              ) : (
                <Input
                  type={c.type ?? "text"}
                  value={values[c.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                  placeholder={c.placeholder}
                />
              )}
            </div>
          ))}
          {motivoObrigatorio && (
            <div>
              <Label className="text-xs">{motivoLabel}</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Mínimo 5 caracteres"
                rows={2}
              />
            </div>
          )}
          {!motivoObrigatorio && (
            <div>
              <Label className="text-xs">Observação (opcional)</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
            </div>
          )}
          {children}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button variant={variant} onClick={handle} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
