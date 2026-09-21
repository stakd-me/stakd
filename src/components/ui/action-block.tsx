import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ActionBlockProps {
  title: ReactNode;
  /** The evidence: real figures, never "your portfolio needs attention". */
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * The loud half of Callout, and the only component allowed the 8px ink
 * spine. At most one per screen — it is the thing the dashboard exists to
 * show, and it sits above the charts, not below them.
 */
export function ActionBlock({
  title,
  detail,
  action,
  className,
}: ActionBlockProps) {
  return (
    <div className={cn("flex items-stretch border-2 border-border bg-bg-card", className)}>
      <div className="w-2 shrink-0 bg-ink" aria-hidden="true" />
      <div className="flex grow flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 grow">
          <div className="text-body font-semibold text-text-primary">{title}</div>
          {detail ? (
            <div className="mt-1 font-mono text-num-sm tabular text-text-secondary">
              {detail}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
