import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** Rendered after the label, e.g. "(required)" or "(optional)". */
  requiredLabel?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  requiredLabel,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-body font-semibold text-text-primary"
      >
        {label}
        {requiredLabel ? (
          <span className="ml-1 font-normal text-text-muted">{requiredLabel}</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-status-negative" role="alert" aria-live="polite">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
