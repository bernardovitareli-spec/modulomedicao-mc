import { ReactNode, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "default" | "destructive" | "warning";

export interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  variant?: ConfirmVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonMinLength?: number;
  requireTypedConfirmation?: string;
  loading?: boolean;
  onConfirm: (reason?: string) => Promise<void> | void;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = "default",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  requireReason = false,
  reasonLabel = "Motivo",
  reasonPlaceholder,
  reasonMinLength = 5,
  requireTypedConfirmation,
  loading: loadingProp,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [internalLoading, setInternalLoading] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const loading = loadingProp ?? internalLoading;

  useEffect(() => {
    if (!open) {
      setReason("");
      setTyped("");
      setInternalLoading(false);
    } else {
      setTimeout(() => {
        if (requireReason) reasonRef.current?.focus();
        else if (requireTypedConfirmation) typedRef.current?.focus();
      }, 50);
    }
  }, [open, requireReason, requireTypedConfirmation]);

  const reasonOk = !requireReason || reason.trim().length >= reasonMinLength;
  const typedOk = !requireTypedConfirmation || typed === requireTypedConfirmation;
  const canConfirm = reasonOk && typedOk && !loading;

  const confirmClass =
    variant === "destructive"
      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      : variant === "warning"
      ? "bg-warning text-warning-foreground hover:bg-warning/90"
      : "";

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setInternalLoading(true);
    try {
      await onConfirm(requireReason ? reason.trim() : undefined);
      onOpenChange(false);
    } catch {
      // caller handles toast; keep dialog open
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (loading) return;
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle
            className={cn(
              "flex items-center gap-2",
              variant === "destructive" && "text-destructive",
              variant === "warning" && "text-warning",
            )}
          >
            {(variant === "destructive" || variant === "warning") && (
              <AlertTriangle className="h-5 w-5" />
            )}
            {title}
          </AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>

        {requireReason && (
          <div className="space-y-1">
            <Label className="text-xs">{reasonLabel} *</Label>
            <Textarea
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder ?? `Mínimo ${reasonMinLength} caracteres`}
              rows={3}
              aria-live="polite"
            />
            <div className="text-[11px] text-muted-foreground text-right">
              {reason.trim().length}/{reasonMinLength}
            </div>
          </div>
        )}

        {requireTypedConfirmation && (
          <div className="space-y-1">
            <Label className="text-xs">
              Para confirmar, digite <span className="font-mono font-semibold">{requireTypedConfirmation}</span>
            </Label>
            <Input
              ref={typedRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTypedConfirmation}
              className="font-mono"
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={confirmClass}
            disabled={!canConfirm}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
