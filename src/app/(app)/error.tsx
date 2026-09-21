"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col items-center justify-center border border-border bg-bg-card px-6 py-10 text-center">
      <AlertCircle className="h-6 w-6 text-status-negative" aria-hidden="true" />
      <h1 className="mt-3 text-heading text-text-primary">
        {t("nav.pageErrorTitle")}
      </h1>
      <p className="mt-1.5 max-w-sm text-body text-text-secondary">
        {t("nav.pageErrorBody")}
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
        {t("common.tryAgain")}
      </Button>
    </div>
  );
}
