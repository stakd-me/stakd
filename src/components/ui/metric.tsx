import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const valueVariants = cva("mt-1.5 font-mono tabular", {
  variants: {
    tone: {
      neutral: "text-text-primary",
      positive: "text-status-positive",
      negative: "text-status-negative",
      warning: "text-status-warning",
      caution: "text-status-caution",
      muted: "text-text-muted",
    },
    size: {
      md: "text-num-lg",
      lg: "text-num-xl",
    },
  },
  defaultVariants: { tone: "neutral", size: "lg" },
});

export interface MetricProps extends VariantProps<typeof valueVariants> {
  label: ReactNode;
  value: ReactNode;
  /** One supporting line: a delta, a share, a count. */
  sub?: ReactNode;
  subTone?: NonNullable<VariantProps<typeof valueVariants>["tone"]>;
  className?: string;
}

const subToneClass = {
  neutral: "text-text-secondary",
  positive: "text-status-positive",
  negative: "text-status-negative",
  warning: "text-status-warning",
  caution: "text-status-caution",
  muted: "text-text-muted",
} as const;

/**
 * One labelled figure. Replaces StatCard, KpiCard and SummaryStrip, which
 * differed only in radius and tone plumbing.
 *
 * Tone is `positive`/`negative` only when the figure IS a gain or a loss.
 * A total value or a count is always neutral — a portfolio total is not
 * good news, and colouring it teaches the eye to ignore colour where it
 * matters.
 */
export function Metric({
  label,
  value,
  sub,
  subTone = "muted",
  tone,
  size,
  className,
}: MetricProps) {
  return (
    <div className={cn("px-5 py-3.5", className)}>
      <div className="font-mono text-meta uppercase text-text-muted">{label}</div>
      <div className={valueVariants({ tone, size })}>{value}</div>
      {sub ? (
        <div className={cn("mt-1 font-mono text-num-sm tabular", subToneClass[subTone])}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

interface MetricBandProps {
  children: ReactNode;
  /** Desktop column count. Below md the band always stacks to two. */
  columns?: 2 | 3 | 4;
  className?: string;
}

const columnClass = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
} as const;

/**
 * Metrics are one outlined object divided by rules — not four separate
 * boxes with four separate borders.
 */
export function MetricBand({ children, columns = 4, className }: MetricBandProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 border border-border bg-bg-card",
        columnClass[columns],
        "[&>*]:border-border-subtle [&>*]:border-b [&>*]:border-r",
        "[&>*:nth-child(2n)]:border-r-0 md:[&>*]:border-b-0 md:[&>*]:border-r",
        columns === 2
          ? "md:[&>*:nth-child(2n)]:border-r-0"
          : columns === 3
            ? "md:[&>*:nth-child(2n)]:border-r md:[&>*:nth-child(3n)]:border-r-0"
            : "md:[&>*:nth-child(2n)]:border-r md:[&>*:nth-child(4n)]:border-r-0",
        "[&>*:last-child]:border-b-0 [&>*:last-child]:border-r-0",
        className
      )}
    >
      {children}
    </div>
  );
}
