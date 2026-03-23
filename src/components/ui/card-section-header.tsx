import type { ReactNode } from "react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CardSectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  titleClassName?: string;
}

export function CardSectionHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
  titleClassName,
}: CardSectionHeaderProps) {
  return (
    <CardHeader className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle
            className={cn(
              icon ? "flex items-center gap-2" : "",
              titleClassName
            )}
          >
            {icon}
            {title}
          </CardTitle>
          {subtitle ? (
            <div className="text-sm text-text-subtle">{subtitle}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </CardHeader>
  );
}
