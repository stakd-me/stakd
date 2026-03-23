import type { HTMLAttributes, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiTone = "default" | "positive" | "negative" | "warning" | "info" | "muted";
type KpiValueSize = "lg" | "xl" | "2xl" | "3xl";

interface KpiCardProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  valueTone?: Exclude<KpiTone, "muted">;
  valueSize?: KpiValueSize;
  secondary?: ReactNode;
  secondaryTone?: KpiTone;
  tertiary?: ReactNode;
}

function getToneClass(tone: KpiTone): string {
  switch (tone) {
    case "positive":
      return "text-status-positive";
    case "negative":
      return "text-status-negative";
    case "warning":
      return "text-status-warning";
    case "info":
      return "text-status-info";
    case "muted":
      return "text-text-subtle";
    default:
      return "text-text-primary";
  }
}

function getValueSizeClass(size: KpiValueSize): string {
  switch (size) {
    case "lg":
      return "text-lg";
    case "xl":
      return "text-xl";
    case "2xl":
      return "text-2xl";
    default:
      return "text-3xl";
  }
}

export function KpiCard({
  label,
  value,
  valueTone = "default",
  valueSize = "2xl",
  secondary,
  secondaryTone = "muted",
  tertiary,
  className,
  ...props
}: KpiCardProps) {
  return (
    <Card className={className} {...props}>
      <CardHeader>
        <CardTitle className="text-sm text-text-subtle">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "font-bold",
            getValueSizeClass(valueSize),
            getToneClass(valueTone)
          )}
        >
          {value}
        </p>
        {secondary ? (
          <div className={cn("mt-2 text-sm font-medium", getToneClass(secondaryTone))}>
            {secondary}
          </div>
        ) : null}
        {tertiary ? (
          <div className="mt-1 text-xs text-text-dim">
            {tertiary}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
