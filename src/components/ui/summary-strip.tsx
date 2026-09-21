import type { HTMLAttributes, ReactNode } from "react";
import { StatCard, type StatCardAlign, type StatCardSize, type StatCardTone } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";

interface SummaryStripItem {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatCardTone;
  valueClassName?: string;
}

interface SummaryStripProps extends HTMLAttributes<HTMLDivElement> {
  items: SummaryStripItem[];
  columnsClassName?: string;
  size?: StatCardSize;
  align?: StatCardAlign;
}

/**
 * A row of figures built from data. Same shape as MetricBand — one
 * outlined object divided by rules, not a row of separate boxes.
 */
export function SummaryStrip({
  items,
  columnsClassName,
  size = "default",
  align = "left",
  className,
  ...props
}: SummaryStripProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px border border-border bg-border-subtle",
        "[&>*]:bg-bg-card",
        columnsClassName,
        className
      )}
      {...props}
    >
      {items.map((item, index) => (
        <StatCard
          key={item.key ?? `${index}`}
          label={item.label}
          value={item.value}
          hint={item.hint}
          tone={item.tone}
          size={size}
          align={align}
          valueClassName={item.valueClassName}
        />
      ))}
    </div>
  );
}
