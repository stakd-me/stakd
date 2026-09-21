import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Tone means what the colour tokens mean: success is money up, danger is
// money down, warning is a crossed threshold, caution is concentration or
// a calendar block, info carries no judgement, and neutral is a mode
// label that is neither good nor bad.
const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] leading-4",
  {
    variants: {
      tone: {
        neutral: "bg-bg-input text-text-secondary",
        info: "bg-status-info-soft text-status-info",
        success: "bg-status-positive-soft text-status-positive",
        warning: "bg-status-warning-soft text-status-warning",
        caution: "bg-status-caution-soft text-status-caution",
        danger: "bg-status-negative-soft text-status-negative",
      },
      bordered: { true: "", false: "border-transparent" },
    },
    compoundVariants: [
      { tone: "neutral", bordered: true, class: "border-border-subtle" },
      { tone: "info", bordered: true, class: "border-status-info-border" },
      { tone: "success", bordered: true, class: "border-status-positive-border" },
      { tone: "warning", bordered: true, class: "border-status-warning-border" },
      { tone: "caution", bordered: true, class: "border-status-caution-border" },
      { tone: "danger", bordered: true, class: "border-status-negative-border" },
    ],
    defaultVariants: { tone: "neutral", bordered: true },
  }
);

interface StatusPillProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  icon?: ReactNode;
}

export function StatusPill({
  tone,
  icon,
  bordered = true,
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span className={cn(pillVariants({ tone, bordered }), className)} {...props}>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}
