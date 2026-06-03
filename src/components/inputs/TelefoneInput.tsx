import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatarTelefone, normalizarTelefone } from "@/lib/br/telefone";

export interface TelefoneInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value?: string | null;
  onChange?: (digits: string) => void;
}

export const TelefoneInput = React.forwardRef<HTMLInputElement, TelefoneInputProps>(
  ({ value, onChange, ...rest }, ref) => (
    <Input
      ref={ref}
      inputMode="tel"
      maxLength={16}
      placeholder="(00) 00000-0000"
      value={value ? formatarTelefone(value) : ""}
      onChange={(e) => onChange?.(normalizarTelefone(e.target.value).slice(0, 11))}
      {...rest}
    />
  ),
);
TelefoneInput.displayName = "TelefoneInput";
