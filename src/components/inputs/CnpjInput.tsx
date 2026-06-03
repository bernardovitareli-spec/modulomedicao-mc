import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatarCNPJ, normalizarCNPJ } from "@/lib/br/cnpj";

export interface CnpjInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value?: string | null;
  onChange?: (digits: string) => void;
}

export const CnpjInput = React.forwardRef<HTMLInputElement, CnpjInputProps>(
  ({ value, onChange, className, ...rest }, ref) => {
    const display = value ? formatarCNPJ(value) : "";
    return (
      <Input
        ref={ref}
        inputMode="numeric"
        maxLength={18}
        placeholder="00.000.000/0000-00"
        value={display}
        onChange={(e) => onChange?.(normalizarCNPJ(e.target.value).slice(0, 14))}
        className={cn("font-mono", className)}
        {...rest}
      />
    );
  },
);
CnpjInput.displayName = "CnpjInput";
