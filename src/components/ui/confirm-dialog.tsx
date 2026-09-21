"use client";

import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useTranslation } from "@/hooks/use-translation";

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "default",
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onCancel);
  const titleId = useId();
  const descriptionId = useId();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-overlay-scrim"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative mx-4 w-full max-w-md rounded-overlay border border-border bg-bg-card p-5 shadow-overlay animate-fade-in-scale"
      >
        <div className="flex items-start gap-4">
          {variant === "danger" && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-status-negative-soft">
              <AlertTriangle className="h-5 w-5 text-status-negative" aria-hidden="true" />
            </div>
          )}
          <div className="flex-1">
            <h3 id={titleId} className="text-display-sm text-text-primary">
              {title}
            </h3>
            {description && (
              <p id={descriptionId} className="mt-1.5 text-body text-text-secondary">
                {description}
              </p>
            )}
            {children}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel ?? t("common.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
