"use client";

import { type ReactNode, useId } from "react";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const panelVariants = cva(
  cn(
    "relative w-full max-h-[90vh] overflow-y-auto",
    "rounded-overlay border border-border bg-bg-card p-5 shadow-overlay animate-fade-in-scale"
  ),
  {
    variants: {
      size: {
        sm: "max-w-md",
        lg: "max-w-3xl",
      },
    },
    defaultVariants: { size: "sm" },
  }
);

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Shown left of the title, e.g. the danger glyph on a confirm. */
  icon?: ReactNode;
  /** Adds a labelled close (X) button to the header. */
  showClose?: boolean;
  size?: "sm" | "lg";
  busy?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * The one modal shell: scrim, focus trap with Escape, restored focus,
 * labelled title/description, overlay radius and shadow. Every dialog in the
 * app composes this instead of rebuilding the overlay.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  showClose = false,
  size,
  busy,
  footer,
  children,
}: DialogProps) {
  const { t } = useTranslation();
  const panelRef = useFocusTrap<HTMLDivElement>(open, onClose);
  const titleId = useId();
  const descriptionId = useId();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div
        className="absolute inset-0 bg-overlay-scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={panelVariants({ size })}
      >
        <div className="flex items-start gap-4">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-display-sm text-text-primary">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1.5 text-body text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          {showClose ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {children ? <div className="mt-4">{children}</div> : null}

        {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
      </div>
    </div>
  );
}
