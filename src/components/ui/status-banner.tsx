import type { HTMLAttributes, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatusBannerTone = "info" | "success" | "warning" | "danger";

interface StatusBannerProps extends HTMLAttributes<HTMLDivElement> {
  tone?: StatusBannerTone;
  heading: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
  contentClassName?: string;
}

export function StatusBanner({
  tone = "info",
  heading,
  icon,
  action,
  description,
  children,
  className,
  contentClassName,
  ...props
}: StatusBannerProps) {
  return (
    <Card
      className={cn(
        {
          "border-status-info-border": tone === "info",
          "border-status-positive-border": tone === "success",
          "border-status-warning-border": tone === "warning",
          "border-status-negative-border": tone === "danger",
        },
        className
      )}
      {...props}
    >
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            {icon ? (
              <span
                className={cn({
                  "text-status-info": tone === "info",
                  "text-status-positive": tone === "success",
                  "text-status-warning": tone === "warning",
                  "text-status-negative": tone === "danger",
                })}
              >
                {icon}
              </span>
            ) : null}
            {heading}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4", contentClassName)}>
        {description ? (
          <p
            className={cn(
              "text-sm font-medium",
              {
                "text-status-info": tone === "info",
                "text-status-positive": tone === "success",
                "text-status-warning": tone === "warning",
                "text-status-negative": tone === "danger",
              }
            )}
          >
            {description}
          </p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}
