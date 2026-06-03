import { toast as sonnerToast, type ExternalToast } from "sonner";

type Opts = ExternalToast;

const base = (message: string, opts?: Opts) => sonnerToast(message, { position: "top-right", ...opts });

export const notify = {
  success: (message: string, opts?: Opts) =>
    sonnerToast.success(message, { position: "top-right", ...opts }),
  error: (message: string | unknown, opts?: Opts) => {
    const msg =
      typeof message === "string"
        ? message
        : (message as Error)?.message ?? "Ocorreu um erro inesperado.";
    return sonnerToast.error(msg, { position: "top-right", duration: 6000, ...opts });
  },
  warning: (message: string, opts?: Opts) =>
    sonnerToast.warning(message, { position: "top-right", ...opts }),
  info: (message: string, opts?: Opts) =>
    sonnerToast.info(message, { position: "top-right", ...opts }),
  message: base,
  promise: <T,>(
    p: Promise<T>,
    msgs: { loading: string; success: string | ((v: T) => string); error: string | ((e: unknown) => string) },
  ) => sonnerToast.promise(p, { position: "top-right", ...msgs } as any),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};

export type Notify = typeof notify;
