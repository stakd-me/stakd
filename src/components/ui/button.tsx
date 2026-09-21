import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Structured Signal: `default` is the ink-filled primary. `accent` is
// reserved for the single action a screen exists to start — never two in
// one region. `destructive` is outline-only, because a filled red block is
// what a person clicks by reflex.
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 rounded-md border border-transparent font-semibold",
    "transition-colors duration-[120ms] ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
    "disabled:pointer-events-none disabled:border-border-subtle disabled:bg-bg-input disabled:text-text-dim"
  ),
  {
    variants: {
      variant: {
        default: "bg-ink text-text-inverse hover:bg-ink/90",
        accent: "bg-accent text-accent-ink hover:bg-accent/90",
        outline: "border-border bg-transparent text-text-primary hover:bg-bg-hover",
        ghost: "bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary",
        destructive:
          "border-status-negative bg-transparent text-status-negative hover:bg-status-negative-soft",
      },
      size: {
        default: "h-control-md px-3.5 text-body",
        sm: "h-control-sm px-2.5 text-caption",
        lg: "h-control-lg px-4.5 text-body",
        icon: "h-control-md w-control-md px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
