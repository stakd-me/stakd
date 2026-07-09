"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { escapeCsvField } from "@/lib/portfolio/csv-parser";
import type { PortfolioTransaction } from "@/components/portfolio/types";

/**
 * CSV export of the transaction history (client-side blob download).
 * Toasts / i18n messages are unchanged from the original page.
 */
export function useCsvExport(transactions: PortfolioTransaction[]) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const exportCsv = useCallback(() => {
    try {
      const headers = [
        "Date",
        "Type",
        "Symbol",
        "Name",
        "Quantity",
        "Price",
        "Total",
        "Fee",
        "Note",
        "CoinGecko ID",
      ];

      const rows = transactions.map((tx) => [
        tx.transactedAt,
        tx.type,
        tx.tokenSymbol,
        tx.tokenName,
        tx.quantity,
        tx.pricePerUnit,
        tx.totalCost,
        tx.fee,
        tx.note || "",
        tx.coingeckoId || "",
      ]);

      const csv =
        headers.map(escapeCsvField).join(",") +
        "\n" +
        rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t("portfolio.csvExported"), "success");
    } catch {
      toast(t("portfolio.failedExport"), "error");
    }
  }, [transactions, t, toast]);

  return { exportCsv };
}
