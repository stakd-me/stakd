import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatusPillTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "caution"
  | "danger";

interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusPillTone;
  icon?: ReactNode;
  bordered?: boolean;
}

export function StatusPill({
  tone = "neutral",
  icon,
  bordered = true,
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        {
          "bg-bg-muted text-text-tertiary": tone === "neutral" && !bordered,
          "border border-border bg-bg-muted text-text-tertiary":
            tone === "neutral" && bordered,
          "bg-status-info-soft text-status-info": tone === "info" && !bordered,
          "border border-status-info-border bg-status-info-soft text-status-info":
            tone === "info" && bordered,
          "bg-status-positive-soft text-status-positive":
            tone === "success" && !bordered,
          "border border-status-positive-border bg-status-positive-soft text-status-positive":
            tone === "success" && bordered,
          "bg-status-warning-soft text-status-warning":
            tone === "warning" && !bordered,
          "border border-status-warning-border bg-status-warning-soft text-status-warning":
            tone === "warning" && bordered,
          "bg-status-caution-soft text-status-caution":
            tone === "caution" && !bordered,
          "border border-status-caution-border bg-status-caution-soft text-status-caution":
            tone === "caution" && bordered,
          "bg-status-negative-soft text-status-negative":
            tone === "danger" && !bordered,
          "border border-status-negative-border bg-status-negative-soft text-status-negative":
            tone === "danger" && bordered,
        },
        className
      )}
      {...props}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}
