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

const toneClass: Record<StatCardTone, string> = {
  default: "text-text-primary",
  info: "text-accent",
  positive: "text-status-positive",
  warning: "text-status-warning",
  negative: "text-status-negative",
};

/**
 * A single cell of a SummaryStrip. Shares Metric's anatomy — mono label,
 * mono tabular figure — but keeps its own props because two pages build
 * strips from data rather than writing the cells out.
 */
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
        size === "default" ? "px-4 py-3" : "px-3 py-2.5",
        align === "center" ? "text-center" : "",
        className
      )}
      {...props}
    >
      <p className="font-mono text-meta uppercase text-text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-mono tabular",
          size === "default" ? "text-num-lg" : "text-num-xl",
          toneClass[tone],
          valueClassName
        )}
      >
        {value}
      </p>
      {hint ? (
        <div className="mt-1 text-caption text-text-muted">{hint}</div>
      ) : null}
    </div>
  );
}
