"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import type {
  RebalanceStrategy,
  Suggestion,
  SuggestionsData,
} from "@/components/rebalance/types";

/**
 * Report/CSV export for the rebalance screen.
 */
export function useRebalanceExport(
  suggestionsData: SuggestionsData | undefined,
  rebalanceStrategy: RebalanceStrategy,
  formatSuggestionTradeQuantity: (suggestion: Suggestion) => string,
  getRoundedSuggestionTradeQuantity: (suggestion: Suggestion) => number | null,
) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleExportReport = useCallback(() => {
    try {
      if (!suggestionsData) return;
      const lines: string[] = [
        "REBALANCE REPORT",
        `Date: ${new Date().toISOString().split("T")[0]}`,
        `Total Portfolio: ${formatUsd(suggestionsData.totalValue)}`,
        `Strategy: ${rebalanceStrategy}`,
        "",
        "TOKEN | TARGET | CURRENT | DEVIATION | ACTION | QUANTITY | AMOUNT",
        "------|--------|---------|-----------|--------|----------|-------",
      ];
      for (const s of suggestionsData.targets.filter((s) => !s.isUntargeted)) {
        lines.push(
          `${s.tokenSymbol} | ${s.targetPercent.toFixed(1)}% | ${s.currentPercent.toFixed(1)}% | ${s.deviation >= 0 ? "+" : ""}${s.deviation.toFixed(1)}% | ${s.action} | ${formatSuggestionTradeQuantity(s)} | ${s.action !== "hold" ? formatUsd(s.amount) : "-"}`
        );
      }
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rebalance_report_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t("rebalance.reportExported"), "success");
    } catch {
      toast(t("rebalance.exportFailed"), "error");
    }
  }, [formatSuggestionTradeQuantity, suggestionsData, rebalanceStrategy, toast, t]);

  const handleExportCsv = useCallback(() => {
    try {
      if (!suggestionsData) return;
      const headers = ["Token", "Target%", "Current%", "Deviation%", "Action", "Quantity", "Amount"];
      const rows = suggestionsData.targets
        .filter((s) => !s.isUntargeted)
        .map((s) => {
          const roundedQuantity = getRoundedSuggestionTradeQuantity(s);
          const symbol = s.tokenSymbol.trim().toUpperCase();
          return [
            s.tokenSymbol,
            s.targetPercent.toFixed(1),
            s.currentPercent.toFixed(1),
            s.deviation.toFixed(1),
            s.action,
            roundedQuantity !== null
              ? symbol === "BTC"
                ? roundedQuantity.toFixed(1)
                : roundedQuantity.toFixed(0)
              : "",
            s.action !== "hold" ? s.amount.toFixed(2) : "0",
          ].join(",");
        });
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rebalance_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t("rebalance.csvExported"), "success");
    } catch {
      toast(t("rebalance.exportFailed"), "error");
    }
  }, [getRoundedSuggestionTradeQuantity, suggestionsData, toast, t]);

  return {
    handleExportReport,
    handleExportCsv,
  };
}
