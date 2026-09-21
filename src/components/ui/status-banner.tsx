import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const bannerVariants = cva("", {
  variants: {
    tone: {
      info: "border-status-info-border",
      success: "border-status-positive-border",
      warning: "border-status-warning-border",
      danger: "border-status-negative-border",
    },
  },
  defaultVariants: { tone: "info" },
});

const toneTextClass = {
  info: "text-status-info",
  success: "text-status-positive",
  warning: "text-status-warning",
  danger: "text-status-negative",
} as const;

interface StatusBannerProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bannerVariants> {
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
  const accentClass = toneTextClass[tone ?? "info"];

  return (
    <Card className={cn(bannerVariants({ tone }), className)} {...props}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            {icon ? <span className={accentClass}>{icon}</span> : null}
            {heading}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4", contentClassName)}>
        {description ? (
          <p className="text-body text-text-secondary">{description}</p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}
