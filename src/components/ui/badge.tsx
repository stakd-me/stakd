import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "destructive";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        {
          "bg-bg-muted text-text-tertiary": variant === "default",
          "bg-status-positive-soft text-status-positive": variant === "success",
          "bg-status-warning-soft text-status-warning": variant === "warning",
          "bg-status-negative-soft text-status-negative": variant === "destructive",
        },
        className
      )}
      {...props}
    />
  );
}
