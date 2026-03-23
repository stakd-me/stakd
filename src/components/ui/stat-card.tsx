import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatCardTone = "default" | "info" | "positive" | "warning" | "negative";
export type StatCardAlign = "left" | "center";
export type StatCardSize = "default" | "compact";

interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatCardTone;
  align?: StatCardAlign;
  size?: StatCardSize;
  valueClassName?: string;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  align = "left",
  size = "default",
  className,
  valueClassName,
  ...props
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle bg-bg-card",
        size === "default" ? "px-4 py-3" : "px-3 py-2",
        align === "center" ? "text-center" : "",
        className
      )}
      {...props}
    >
      <p className="text-xs text-text-subtle">{label}</p>
      <p
        className={cn(
          "mt-2 font-semibold",
          size === "default" ? "text-lg" : "text-2xl font-bold",
          {
            "text-text-primary": tone === "default",
            "text-status-info": tone === "info",
            "text-status-positive": tone === "positive",
            "text-status-warning": tone === "warning",
            "text-status-negative": tone === "negative",
          },
          valueClassName
        )}
      >
        {value}
      </p>
      {hint ? <div className="mt-1 text-xs text-text-dim">{hint}</div> : null}
    </div>
  );
}
