import { cva } from "class-variance-authority";

/**
 * A button in a single-choice row of chips (transaction type picker,
 * list filters). Selected is `accent`, because that is what accent means.
 */
export const toggleChipVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 border font-semibold",
    "transition-colors duration-[120ms] ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
  ],
  {
    variants: {
      active: {
        true: "border-accent bg-accent-soft text-text-primary",
        false:
          "border-border-subtle bg-transparent text-text-muted hover:bg-bg-hover hover:text-text-primary",
      },
      size: {
        lg: "h-control-lg text-body",
        compact: "h-control-lg px-3 text-caption md:h-control-sm",
      },
    },
    defaultVariants: { active: false, size: "compact" },
  }
);
