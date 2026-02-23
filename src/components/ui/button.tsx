import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
          "disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-accent text-bg-page hover:bg-accent/90": variant === "default",
            "border border-border bg-transparent text-text-primary hover:bg-bg-hover":
              variant === "outline",
            "text-text-muted hover:bg-bg-hover hover:text-text-primary":
              variant === "ghost",
            "bg-status-negative text-bg-page hover:opacity-90":
              variant === "destructive",
          },
          {
            "h-10 px-4 py-2 text-sm": size === "default",
            "h-8 px-3 text-xs": size === "sm",
            "h-12 px-6 text-base": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
