"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PortfolioLineChart } from "@/components/charts/portfolio-line";
import { formatUsd } from "@/lib/utils";
import { ChartSkeleton, Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/use-translation";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import type { VaultTransaction } from "@/lib/crypto/vault-types";
import { getPortfolioSummary } from "@/lib/services/portfolio-calculator";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip as ChartTooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, ChartTooltip, Filler);

interface PLPoint {
  date: string;
  cumulativePL: number;
  symbol: string;
  pl: number;
}

/**
 * Compute realized P&L timeline from sell transactions.
 * For each sell, we compute: pl = (sellPrice - avgCostBasis) * quantity
 * using the average cost basis at the time of the sell (FIFO-like running average).
 */
function computeRealizedPLTimeline(transactions: VaultTransaction[]): {
  timeline: PLPoint[];
  totalRealizedPL: number;
} {
  // Sort all transactions chronologically
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.transactedAt).getTime() - new Date(b.transactedAt).getTime()
  );

  // Track running cost basis per token key
  const costBasis: Record<string, { totalCost: number; totalQty: number }> = {};

  const timeline: PLPoint[] = [];
  let cumulativePL = 0;

  for (const tx of sorted) {
    const key = `${tx.tokenSymbol.toUpperCase()}:${tx.coingeckoId ?? ""}`;
    const qty = parseFloat(tx.quantity);
    const cost = parseFloat(tx.totalCost);
    const fee = parseFloat(tx.fee || "0");

    if (!costBasis[key]) {
      costBasis[key] = { totalCost: 0, totalQty: 0 };
    }

    if (tx.type === "buy" || tx.type === "receive") {
      if (tx.type === "buy") {
        costBasis[key].totalCost += cost + fee;
      }
      costBasis[key].totalQty += qty;
    } else if (tx.type === "sell") {
      const avgCost =
        costBasis[key].totalQty > 0
          ? costBasis[key].totalCost / costBasis[key].totalQty
          : 0;
      const sellPrice = qty > 0 ? (cost - fee) / qty : 0;
      const pl = (sellPrice - avgCost) * qty;

      // Reduce the cost basis pool proportionally
      if (costBasis[key].totalQty > 0) {
        const fraction = qty / costBasis[key].totalQty;
        costBasis[key].totalCost -= costBasis[key].totalCost * fraction;
      }
      costBasis[key].totalQty -= qty;

      cumulativePL += pl;

      timeline.push({
        date: tx.transactedAt,
        cumulativePL,
        symbol: tx.tokenSymbol.toUpperCase(),
        pl,
      });
    }
  }

  return { timeline, totalRealizedPL: cumulativePL };
}

export default function HistoryPage() {
  const { t } = useTranslation();
  const chartTheme = useChartTheme();
  const vault = useVaultStore((s) => s.vault);
  const { isLoading, priceMap } = usePrices();

  const snapshots = vault.portfolioSnapshots;

  const plData = useMemo(
    () => computeRealizedPLTimeline(vault.transactions),
    [vault.transactions]
  );

  const chartData = useMemo(() => {
    const fromSnapshots =
      snapshots?.map((s) => ({
        date: s.snapshotAt,
        value: s.totalValueUsd,
      })) ?? [];

    if (fromSnapshots.length > 0) {
      return fromSnapshots;
    }

    const currentTotal = getPortfolioSummary(vault, priceMap).totalValueUsd;
    if (currentTotal > 0) {
      return [{ date: new Date().toISOString(), value: currentTotal }];
    }

    return [];
  }, [priceMap, snapshots, vault]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("history.title")}</h1>
          <p className="text-text-subtle">{t("history.subtitle")}</p>
        </div>
        <ChartSkeleton />
        <div className="rounded-lg border border-border bg-bg-card p-6">
          <Skeleton className="mb-4 h-5 w-24" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("history.title")}</h1>
        <p className="text-text-subtle">{t("history.subtitle")}</p>
      </div>

      {/* Realized P&L Timeline */}
      {plData && plData.timeline.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("history.realizedPLTimeline")}</CardTitle>
              <span
                className={`text-lg font-bold ${
                  plData.totalRealizedPL >= 0 ? "text-status-positive" : "text-status-negative"
                }`}
              >
                {plData.totalRealizedPL >= 0 ? "+" : ""}
                {formatUsd(plData.totalRealizedPL)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <Line
                data={{
                  labels: plData.timeline.map((p) => {
                    const d = new Date(p.date);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }),
                  datasets: [
                    {
                      data: plData.timeline.map((p) => p.cumulativePL),
                      borderColor: plData.totalRealizedPL >= 0 ? "#22c55e" : "#ef4444",
                      borderWidth: 2,
                      fill: true,
                      backgroundColor: plData.totalRealizedPL >= 0
                        ? "rgba(34, 197, 94, 0.1)"
                        : "rgba(239, 68, 68, 0.1)",
                      tension: 0.3,
                      pointRadius: 0,
                      pointHitRadius: 10,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    tooltip: {
                      backgroundColor: chartTheme.tooltipBg,
                      titleColor: chartTheme.tooltipText,
                      bodyColor: chartTheme.tooltipText,
                      borderColor: chartTheme.tooltipBorder,
                      borderWidth: 1,
                      cornerRadius: 8,
                      callbacks: {
                        title: (items) => {
                          const idx = items[0].dataIndex;
                          const p = plData.timeline[idx];
                          return `${new Date(p.date).toLocaleDateString()} — ${p.symbol}`;
                        },
                        label: (item) => `Cumulative P&L: ${formatUsd(item.raw as number)}`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      grid: { color: chartTheme.gridColor },
                      ticks: { color: chartTheme.tickColor, font: { size: 12 }, maxTicksLimit: 8 },
                    },
                    y: {
                      grid: { color: chartTheme.gridColor },
                      ticks: {
                        color: chartTheme.tickColor,
                        font: { size: 12 },
                        callback: (value) => `$${value}`,
                      },
                    },
                  },
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("history.valueOverTime")}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <PortfolioLineChart data={chartData} />
          ) : (
            <p className="py-8 text-center text-text-subtle">
              {t("history.noHistoryYet")}
            </p>
          )}
        </CardContent>
      </Card>

      {snapshots && snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("history.snapshots")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...snapshots].reverse().map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md bg-bg-card px-4 py-3"
                >
                  <span className="text-sm text-text-subtle">
                    {new Date(s.snapshotAt).toLocaleString()}
                  </span>
                  <span className="font-medium">
                    {formatUsd(s.totalValueUsd)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
