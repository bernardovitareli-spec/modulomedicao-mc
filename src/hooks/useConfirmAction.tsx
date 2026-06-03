import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from "react";
import { ConfirmActionDialog, ConfirmActionDialogProps } from "@/components/ConfirmActionDialog";

type ConfirmOptions = Omit<ConfirmActionDialogProps, "open" | "onOpenChange" | "onConfirm"> & {
  onConfirm?: (reason?: string) => Promise<void> | void;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<string | null>;

const Ctx = createContext<ConfirmFn | null>(null);

export function ConfirmActionProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
      setOpts(options);
      setOpen(true);
    });
  }, []);

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v);
    if (!v) {
      // cancelled (or closed without confirm)
      if (resolverRef.current) {
        resolverRef.current(null);
        resolverRef.current = null;
      }
    }
  }, []);

  const handleConfirm = useCallback(
    async (reason?: string) => {
      const userOnConfirm = opts?.onConfirm;
      if (userOnConfirm) await userOnConfirm(reason);
      if (resolverRef.current) {
        resolverRef.current(reason ?? "");
        resolverRef.current = null;
      }
    },
    [opts],
  );

  const value = useMemo(() => confirm, [confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {opts && (
        <ConfirmActionDialog
          {...opts}
          open={open}
          onOpenChange={handleOpenChange}
          onConfirm={handleConfirm}
        />
      )}
    </Ctx.Provider>
  );
}

export function useConfirmAction(): ConfirmFn {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirmAction deve ser usado dentro de <ConfirmActionProvider>");
  return ctx;
}
