import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineHelpCardProps {
  title: ReactNode;
  description?: ReactNode;
  items?: ReactNode[];
  action?: ReactNode;
  icon?: ReactNode;
  tone?: "info" | "warning";
  className?: string;
}

const toneClasses: Record<NonNullable<InlineHelpCardProps["tone"]>, string> = {
  info: "border-status-info-border bg-status-info-soft text-status-info",
  warning: "border-status-warning-border bg-status-warning-soft text-status-warning",
};

export function InlineHelpCard({
  title,
  description,
  items,
  action,
  icon,
  tone = "info",
  className,
}: InlineHelpCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        toneClasses[tone],
        className
      )}
    >
      <div className="flex gap-3">
        <div className="mt-0.5 shrink-0 rounded-full border border-current/20 bg-white/40 p-2">
          {icon ?? <Info className="h-4 w-4" />}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">{title}</p>
            {description ? (
              <div className="text-sm text-current/90">{description}</div>
            ) : null}
          </div>

          {items && items.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-current/90">
              {items.map((item, index) => (
                <li key={index} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current/80" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {action ? <div>{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
