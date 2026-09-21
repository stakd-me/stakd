import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * What a panel shows instead of data. Keeps the panel's own height so the
 * page does not jump when data arrives. Say what is missing and what to do
 * about it — never "No data available".
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-border-subtle bg-bg-card px-6 py-8 text-center",
        className
      )}
    >
      <span className="text-text-muted">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden="true" />}
      </span>
      <p className="mt-3 text-heading text-text-primary">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-body text-text-secondary">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
