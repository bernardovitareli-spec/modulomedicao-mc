import * as React from "react";
import { Input } from "@/components/ui/input";

export interface DataInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value?: string | null;
  onChange?: (isoDate: string) => void;
}

// Input nativo type=date — armazena ISO yyyy-mm-dd.
export const DataInput = React.forwardRef<HTMLInputElement, DataInputProps>(
  ({ value, onChange, ...rest }, ref) => (
    <Input
      ref={ref}
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      {...rest}
    />
  ),
);
DataInput.displayName = "DataInput";
