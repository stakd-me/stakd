import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// The quiet half of Callout: a bordered note over its tone's soft ground.
// Prose stays text-primary/text-secondary so readability never depends on
// a hue; only the icon and the border carry the tone.
const noteVariants = cva("rounded-md border p-4", {
  variants: {
    tone: {
      info: "border-status-info-border bg-status-info-soft",
      warning: "border-status-warning-border bg-status-warning-soft",
      caution: "border-status-caution-border bg-status-caution-soft",
      danger: "border-status-negative-border bg-status-negative-soft",
    },
  },
  defaultVariants: { tone: "info" },
});

const iconToneClass: Record<string, string> = {
  info: "text-status-info",
  warning: "text-status-warning",
  caution: "text-status-caution",
  danger: "text-status-negative",
};

interface InlineHelpCardProps extends VariantProps<typeof noteVariants> {
  title: ReactNode;
  description?: ReactNode;
  items?: ReactNode[];
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function InlineHelpCard({
  title,
  description,
  items,
  action,
  icon,
  tone = "info",
  className,
}: InlineHelpCardProps) {
  return (
    <div className={cn(noteVariants({ tone }), className)}>
      <div className="flex gap-3">
        <span className={cn("mt-0.5 shrink-0", iconToneClass[tone ?? "info"])}>
          {icon ?? <Info className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <p className="text-body font-semibold text-text-primary">{title}</p>
            {description ? (
              <div className="text-body text-text-secondary">{description}</div>
            ) : null}
          </div>

          {items && items.length > 0 ? (
            <ul className="space-y-1.5 text-body text-text-secondary">
              {items.map((item, index) => (
                <li key={index} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-sm bg-text-muted" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {action ? <div>{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
