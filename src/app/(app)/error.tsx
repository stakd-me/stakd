"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { useTranslation } from "@/hooks/use-translation";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="border border-border bg-bg-card">
      <ErrorState
        title={t("nav.pageErrorTitle")}
        message={t("nav.pageErrorBody")}
        onRetry={reset}
      />
    </div>
  );
}
