import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatarValorBR, parseValorBR } from "@/lib/br/moeda";

export interface MoedaInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value?: number | null;
  onChange?: (n: number) => void;
  prefix?: string;
}

export const MoedaInput = React.forwardRef<HTMLInputElement, MoedaInputProps>(
  ({ value, onChange, className, prefix = "R$", ...rest }, ref) => {
    const [text, setText] = React.useState<string>(value == null ? "" : formatarValorBR(value));

    React.useEffect(() => {
      const next = value == null ? "" : formatarValorBR(value);
      // só sobrescreve se diferente do parse atual (evita atrito ao digitar)
      if (parseValorBR(text) !== (value ?? 0)) setText(next);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>
        <Input
          ref={ref}
          inputMode="decimal"
          className={cn("pl-9 text-right", className)}
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            onChange?.(parseValorBR(raw));
          }}
          onBlur={(e) => {
            const n = parseValorBR(e.target.value);
            setText(formatarValorBR(n));
            rest.onBlur?.(e);
          }}
          {...rest}
        />
      </div>
    );
  },
);
MoedaInput.displayName = "MoedaInput";
