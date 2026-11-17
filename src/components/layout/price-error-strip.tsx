"use client";

import { useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrices } from "@/hooks/use-prices";
import { useTranslation } from "@/hooks/use-translation";

/**
 * Every figure in the app is quantity × price, so a failed price query
 * quietly turns totals into $0 or stale numbers. Say so once, app-wide,
 * with a retry, instead of letting each page guess.
 */
export function PriceErrorStrip() {
  const { isError, refreshPrices } = usePrices();
  const { t } = useTranslation();
  const [retrying, setRetrying] = useState(false);

  if (!isError) return null;

  const retry = async () => {
    setRetrying(true);
    try {
      await refreshPrices();
    } catch {
      // The query's own error state keeps the strip up.
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-3 border border-status-warning-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
        <div>
          <p className="text-body font-semibold text-text-primary">{t("prices.loadErrorTitle")}</p>
          <p className="text-caption text-text-secondary">{t("prices.loadErrorBody")}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        {t("common.tryAgain")}
      </Button>
    </div>
  );
}
