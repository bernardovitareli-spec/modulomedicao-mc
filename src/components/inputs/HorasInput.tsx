import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface HorasInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value?: number | null;
  onChange?: (n: number) => void;
}

export const HorasInput = React.forwardRef<HTMLInputElement, HorasInputProps>(
  ({ value, onChange, className, ...rest }, ref) => (
    <div className="relative">
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        className={cn("pr-8 text-right", className)}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value === "" ? 0 : Number(e.target.value))}
        {...rest}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">h</span>
    </div>
  ),
);
HorasInput.displayName = "HorasInput";
