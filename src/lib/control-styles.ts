import { cn } from "@/lib/utils";

/**
 * The shared shell for text-entry controls. Input and Select were two
 * copies of the same class string; they are one constant now.
 *
 * Numeric entry uses the mono face so a typed quantity lines up with the
 * figures it becomes — pass `font-mono tabular` at the call site for that.
 */
export const controlBaseClass = cn(
  "flex h-control-md w-full rounded-md border border-border bg-bg-input px-2.5 text-body text-text-primary",
  "transition-colors duration-[120ms] ease-out",
  "placeholder:text-text-dim",
  "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
  // The old `[aria-invalid=true]:` prefix is not valid Tailwind v4 syntax,
  // so invalid fields never actually rendered as invalid.
  "aria-[invalid=true]:border-status-negative aria-[invalid=true]:focus-visible:ring-status-negative/30",
  "disabled:cursor-not-allowed disabled:border-border-subtle disabled:text-text-dim"
);
