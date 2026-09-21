"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  actionLabel?: string;
}

/**
 * The failure intent of EmptyState. Copy defaults come from i18n — the
 * previous version hard-coded English defaults while the keys already
 * existed in all four locales.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  actionLabel,
}: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
      <AlertCircle className="h-6 w-6 text-status-negative" aria-hidden="true" />
      <p className="mt-3 text-heading text-text-primary">
        {title ?? t("common.loadError")}
      </p>
      <p className="mt-1.5 max-w-sm text-body text-text-secondary">
        {message ?? t("common.loadErrorMessage")}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {actionLabel ?? t("common.tryAgain")}
        </Button>
      )}
    </div>
  );
}
