import * as React from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { useFormState } from "react-hook-form";
import { Loader2 } from "lucide-react";

export interface FormSubmitButtonProps extends ButtonProps {
  label?: string;
  labelSubmitting?: string;
  requireDirty?: boolean;
}

export const FormSubmitButton: React.FC<FormSubmitButtonProps> = ({
  label = "Salvar",
  labelSubmitting = "Salvando...",
  requireDirty = true,
  disabled,
  children,
  ...rest
}) => {
  const { isSubmitting, isDirty, isValid } = useFormState();
  const isDisabled = !!disabled || isSubmitting || !isValid || (requireDirty && !isDirty);
  return (
    <Button type="submit" disabled={isDisabled} {...rest}>
      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children ?? (isSubmitting ? labelSubmitting : label)}
    </Button>
  );
};
