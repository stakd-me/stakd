"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep<T extends string> {
  id: T;
  title: ReactNode;
  /** A live count, which is how a person decides whether to skip ahead. */
  caption?: ReactNode;
  done?: boolean;
}

interface StepperProps<T extends string> {
  label: string;
  steps: StepperStep<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

/**
 * A flow with a real order — Set up, Analyse, Execute.
 *
 * Tabs say "pick one of four equal views"; a stepper says "these happen
 * in sequence, you are here, this much is done". Every step stays
 * reachable: this is a tool for someone who knows their own portfolio,
 * not a checkout.
 */
export function Stepper<T extends string>({
  label,
  steps,
  value,
  onChange,
  className,
}: StepperProps<T>) {
  return (
    <div
      className={cn("flex border border-border bg-bg-card", className)}
      role="group"
      aria-label={label}
    >
      {steps.map((step) => {
        const isCurrent = step.id === value;
        return (
          <button
            key={step.id}
            type="button"
            aria-current={isCurrent ? "step" : undefined}
            onClick={() => onChange(step.id)}
            className={cn(
              "flex grow items-center gap-3 border-r border-border-subtle px-4 py-2.5 text-left last:border-r-0",
              "transition-colors duration-[120ms] ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset",
              isCurrent ? "bg-bg-input" : "hover:bg-bg-hover"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center border font-mono text-caption",
                step.done
                  ? "border-ink bg-ink text-text-inverse"
                  : isCurrent
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border text-text-muted"
              )}
            >
              {step.done ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                steps.indexOf(step) + 1
              )}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-body font-semibold",
                  step.done || isCurrent ? "text-text-primary" : "text-text-muted"
                )}
              >
                {step.title}
              </span>
              {step.caption ? (
                <span className="mt-0.5 block truncate font-mono text-meta uppercase text-text-muted">
                  {step.caption}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
