"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AccessibleChartFrame } from "@/components/ui/accessible-chart-frame";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionNavigator, SectionPanel } from "@/components/ui/section-navigator";
import { KpiCard } from "@/components/ui/kpi-card";
import { CardSectionHeader } from "@/components/ui/card-section-header";
import dynamic from "next/dynamic";

const PortfolioLineChart = dynamic(
  () => import("@/components/charts/portfolio-line").then((m) => ({ default: m.PortfolioLineChart })),
  { ssr: false }
);
import { cn, formatUsd } from "@/lib/utils";
import { ChartSkeleton, Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/use-translation";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import type { VaultTransaction } from "@/lib/crypto/vault-types";
import { getPortfolioSummary } from "@/lib/services/portfolio-calculator";
import { expandTransactionForBalance } from "@/lib/transactions";
import Link from "next/link";
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

type HistorySection = "overview" | "realized" | "snapshots" | "all";

/**
 * Compute realized P&L timeline from sell transactions.
 * For each sell, we compute: pl = (sellPrice - avgCostBasis) * quantity
 * using the average cost basis at the time of the sell (FIFO-like running average).
 */
function computeRealizedPLTimeline(transactions: VaultTransaction[]): {
  timeline: PLPoint[];
  totalRealizedPL: number;
} {
  // Settlement legs should update cost-basis pools without showing up as
  // extra realized events in the chart.
  const sorted = transactions.flatMap(expandTransactionForBalance).sort(
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
    } else if (tx.type === "sell" || tx.type === "send") {
      const avgCost =
        costBasis[key].totalQty > 0
          ? costBasis[key].totalCost / costBasis[key].totalQty
          : 0;
      const shouldRecordRealizedPl = tx.type === "sell" && !tx.isSettlement;
      const sellPrice = qty > 0 ? (cost - fee) / qty : 0;
      const pl = shouldRecordRealizedPl ? (sellPrice - avgCost) * qty : 0;

      if (costBasis[key].totalQty > 0) {
        const fraction = qty / costBasis[key].totalQty;
        costBasis[key].totalCost -= costBasis[key].totalCost * fraction;
      }
      costBasis[key].totalQty -= qty;

      if (shouldRecordRealizedPl) {
        cumulativePL += pl;

        timeline.push({
          date: tx.transactedAt,
          cumulativePL,
          symbol: tx.tokenSymbol.toUpperCase(),
          pl,
        });
      }
    }
  }

  return { timeline, totalRealizedPL: cumulativePL };
}

export default function HistoryPage() {
  const sectionsBaseId = "history-sections";
  const [activeSection, setActiveSection] = useState<HistorySection>("overview");
  const { t } = useTranslation();
  const chartTheme = useChartTheme();
  const vault = useVaultStore((s) => s.vault);
  const { isLoading, priceMap } = usePrices({ refetchInterval: 300_000 });

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
  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const recentSnapshots = useMemo(
    () => [...snapshots].reverse().slice(0, 10),
    [snapshots]
  );
  const remainingSnapshotsCount = Math.max(0, snapshots.length - recentSnapshots.length);
  const showOverviewSection =
    activeSection === "all" || activeSection === "overview";
  const showRealizedSection =
    activeSection === "all" || activeSection === "realized";
  const showSnapshotsSection =
    activeSection === "all" || activeSection === "snapshots";
  const sectionOptions = [
    {
      value: "overview" as const,
      label: t("history.sectionOverview"),
      count: chartData.length,
    },
    {
      value: "realized" as const,
      label: t("history.sectionRealized"),
      count: plData.timeline.length,
    },
    {
      value: "snapshots" as const,
      label: t("history.sectionSnapshots"),
      count: snapshots.length,
    },
    {
      value: "all" as const,
      label: t("history.sectionAll"),
      count: chartData.length + plData.timeline.length + snapshots.length,
    },
  ];
  const valueChartSummary = useMemo(() => {
    if (chartData.length === 0) return "";
    const firstPoint = chartData[0];
    const lastPoint = chartData[chartData.length - 1];
    return t("history.valueChartSummary", {
      count: chartData.length,
      start: new Date(firstPoint.date).toLocaleDateString(),
      end: new Date(lastPoint.date).toLocaleDateString(),
      latest: formatUsd(lastPoint.value),
    });
  }, [chartData, t]);
  const realizedChartSummary = useMemo(() => {
    if (plData.timeline.length === 0) return "";
    const lastPoint = plData.timeline[plData.timeline.length - 1];
    return t("history.realizedChartSummary", {
      count: plData.timeline.length,
      date: new Date(lastPoint.date).toLocaleDateString(),
      latest: formatUsd(lastPoint.cumulativePL),
    });
  }, [plData.timeline, t]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("history.title")}
          description={t("history.subtitle")}
        />
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
      <PageHeader
        title={t("history.title")}
        description={t("history.subtitle")}
      />

      <SectionNavigator
        baseId={sectionsBaseId}
        label={t("history.focusView")}
        description={t("history.subtitle")}
        value={activeSection}
        onChange={setActiveSection}
        options={sectionOptions}
        columnsClassName="grid-cols-2 xl:grid-cols-4"
      />

      <SectionPanel baseId={sectionsBaseId} value={activeSection}>
      {showOverviewSection && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <KpiCard
              label={t("history.snapshots")}
              value={snapshots.length}
              valueSize="2xl"
            />
            <KpiCard
              label={t("dashboard.totalValue")}
              value={latestSnapshot ? formatUsd(latestSnapshot.totalValueUsd) : "-"}
              valueSize="2xl"
              tertiary={
                latestSnapshot
                  ? new Date(latestSnapshot.snapshotAt).toLocaleString()
                  : undefined
              }
            />
            <KpiCard
              label={t("history.realizedPLTimeline")}
              value={`${plData.totalRealizedPL >= 0 ? "+" : ""}${formatUsd(plData.totalRealizedPL)}`}
              valueTone={plData.totalRealizedPL >= 0 ? "positive" : "negative"}
              valueSize="2xl"
              tertiary={plData.timeline.length}
            />
          </div>

          <Card>
            <CardSectionHeader title={t("history.valueOverTime")} />
            <CardContent>
              {chartData.length > 0 ? (
                <AccessibleChartFrame
                  title={t("history.valueOverTime")}
                  summary={valueChartSummary}
                >
                  <PortfolioLineChart data={chartData} />
                </AccessibleChartFrame>
              ) : (
                <EmptyState
                  title={t("history.noHistoryYet")}
                  description={t("history.noHistoryHelp")}
                  action={
                    <Link href="/portfolio/add">
                      <Button size="sm" variant="outline">
                        {t("portfolio.addTransaction")}
                      </Button>
                    </Link>
                  }
                  className="py-8"
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {showRealizedSection && (
        <Card>
          <CardSectionHeader
            title={t("history.realizedPLTimeline")}
            actions={
              <span
                className={cn(
                  "text-lg font-bold",
                  plData.totalRealizedPL >= 0
                    ? "text-status-positive"
                    : "text-status-negative"
                )}
              >
                {plData.totalRealizedPL >= 0 ? "+" : ""}
                {formatUsd(plData.totalRealizedPL)}
              </span>
            }
          />
          <CardContent>
            {plData.timeline.length > 0 ? (
              <AccessibleChartFrame
                title={t("history.realizedPLTimeline")}
                summary={realizedChartSummary}
              >
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
                          borderColor:
                            plData.totalRealizedPL >= 0 ? "#22c55e" : "#ef4444",
                          borderWidth: 2,
                          fill: true,
                          backgroundColor:
                            plData.totalRealizedPL >= 0
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
                            label: (item) =>
                              `Cumulative P&L: ${formatUsd(item.raw as number)}`,
                          },
                        },
                      },
                      scales: {
                        x: {
                          grid: { color: chartTheme.gridColor },
                          ticks: {
                            color: chartTheme.tickColor,
                            font: { size: 12 },
                            maxTicksLimit: 8,
                          },
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
              </AccessibleChartFrame>
            ) : (
              <EmptyState
                title={t("history.noRealizedPLYet")}
                description={t("history.noRealizedPLHelp")}
                action={
                  <Link href="/portfolio/add">
                    <Button size="sm" variant="outline">
                      {t("portfolio.addTransaction")}
                    </Button>
                  </Link>
                }
                className="py-8"
              />
            )}
          </CardContent>
        </Card>
      )}

      {showSnapshotsSection && (
        <Card>
          <CardHeader>
            <CardTitle>{t("history.snapshots")}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSnapshots.length > 0 ? (
              <div className="space-y-2">
                {recentSnapshots.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col gap-2 rounded-md bg-bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm text-text-subtle">
                      {new Date(s.snapshotAt).toLocaleString()}
                    </span>
                    <span className="font-medium text-text-primary">
                      {formatUsd(s.totalValueUsd)}
                    </span>
                  </div>
                ))}
                {remainingSnapshotsCount > 0 ? (
                  <p className="text-xs text-text-subtle">
                    {t("common.more", { count: remainingSnapshotsCount.toString() })}
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title={t("history.noHistoryYet")}
                description={t("history.noSnapshotsHelp")}
                action={
                  <Link href="/dashboard">
                    <Button size="sm" variant="outline">
                      {t("dashboard.title")}
                    </Button>
                  </Link>
                }
                className="py-8"
              />
            )}
          </CardContent>
        </Card>
      )}
      </SectionPanel>
    </div>
  );
}
