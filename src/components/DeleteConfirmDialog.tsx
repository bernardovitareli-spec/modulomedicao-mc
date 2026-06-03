/**
 * @deprecated Use o hook `useConfirmAction()` de `@/hooks/useConfirmAction`
 * que cobre motivo obrigatório, confirmação por digitação e variantes do tema.
 * Este wrapper foi mantido apenas para compatibilidade com chamadas existentes.
 */
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";

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
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={message}
      variant="destructive"
      confirmLabel={loading ? "Excluindo..." : "Confirmar exclusão"}
      requireReason
      reasonLabel="Motivo da exclusão"
      reasonMinLength={3}
      requireTypedConfirmation={confirmWord}
      loading={loading}
      onConfirm={async (reason) => {
        await onConfirm(reason ?? "");
      }}
    />
  );
}
