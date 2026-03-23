import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  requiredLabel?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  requiredLabel,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-text-secondary"
      >
        {label}
        {required && requiredLabel ? (
          <span className="ml-1 text-text-dim">({requiredLabel})</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-status-negative" role="alert" aria-live="polite">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-text-dim">{hint}</p>
      ) : null}
    </div>
  );
}
