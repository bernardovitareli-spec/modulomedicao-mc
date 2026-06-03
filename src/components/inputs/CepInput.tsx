import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatarCEP, normalizarCEP } from "@/lib/br/cep";

export interface CepInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value?: string | null;
  onChange?: (digits: string) => void;
}

export const CepInput = React.forwardRef<HTMLInputElement, CepInputProps>(
  ({ value, onChange, ...rest }, ref) => (
    <Input
      ref={ref}
      inputMode="numeric"
      maxLength={9}
      placeholder="00000-000"
      value={value ? formatarCEP(value) : ""}
      onChange={(e) => onChange?.(normalizarCEP(e.target.value).slice(0, 8))}
      {...rest}
    />
  ),
);
CepInput.displayName = "CepInput";
