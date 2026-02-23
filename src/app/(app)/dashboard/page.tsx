"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUsd, formatUsdPrice, formatCrypto, formatTimeAgo } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { useTranslation } from "@/hooks/use-translation";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { AllocationPieChart } from "@/components/charts/allocation-pie";
import { PortfolioLineChart } from "@/components/charts/portfolio-line";
import { RefreshCw, Scale, TrendingUp } from "lucide-react";
import { useState, useMemo } from "react";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, ChartTooltip, ChartLegend);
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useAnalytics } from "@/hooks/use-analytics";
import { useVaultStore } from "@/lib/store";
import {
  getHighConcentrationThresholdPercent,
  parseConcentrationAlertThresholdPercent,
} from "@/lib/constants/risk";

type TimeRange = "24h" | "7d" | "30d" | "90d" | "1y" | "all";
type DashboardAlertSeverity = "low" | "medium" | "high";
type DashboardAlertType = "deviation" | "concentration_token";

interface DashboardAlert {
  tokenSymbol: string;
  deviation: number;
  severity: DashboardAlertSeverity;
  type: DashboardAlertType;
}

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "1y", value: "1y" },
  { label: "All", value: "all" },
];

function getTimeRangeMs(range: TimeRange): number | null {
  switch (range) {
    case "24h": return 24 * 60 * 60 * 1000;
    case "7d": return 7 * 24 * 60 * 60 * 1000;
    case "30d": return 30 * 24 * 60 * 60 * 1000;
    case "90d": return 90 * 24 * 60 * 60 * 1000;
    case "1y": return 365 * 24 * 60 * 60 * 1000;
    case "all": return null;
  }
}

export default function DashboardPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const { toast } = useToast();
  const { format: formatValue } = useCurrency();
  const { t } = useTranslation();
  const chartTheme = useChartTheme();

  // ── Client-side data from vault store + hooks ──────────────────────
  const { breakdown, totals, history, lastPriceUpdate, isLoading, refreshPrices } = usePortfolio();
  const analytics = useAnalytics();
  const vault = useVaultStore((s) => s.vault);
  const concentrationThresholdPercent = parseConcentrationAlertThresholdPercent(
    vault.settings.concentrationThresholdPercent
  );
  const concentrationThresholdLabel = Number.isInteger(concentrationThresholdPercent)
    ? concentrationThresholdPercent.toString()
    : concentrationThresholdPercent.toFixed(1);
  const highConcentrationThresholdPercent = getHighConcentrationThresholdPercent(
    concentrationThresholdPercent
  );

  // ── Client-side rebalance alerts from vault.rebalanceTargets ───────
  const alerts = useMemo(() => {
    const targets = vault.rebalanceTargets;
    if (targets.length === 0 || totals.totalValue === 0) return [];

    const result: DashboardAlert[] = [];

    // Build a map of symbol -> current percent from breakdown
    const currentPercentMap: Record<string, number> = {};
    for (const item of breakdown) {
      const sym = item.symbol.toUpperCase();
      currentPercentMap[sym] = (currentPercentMap[sym] || 0) + item.percent;
    }

    // Deviation alerts: compare each target to current allocation
    for (const target of targets) {
      const sym = target.tokenSymbol.toUpperCase();
      const currentPercent = currentPercentMap[sym] ?? 0;
      const deviation = currentPercent - target.targetPercent;

      if (Math.abs(deviation) > 2) {
        const severity: DashboardAlertSeverity =
          Math.abs(deviation) > 10
            ? "high"
            : Math.abs(deviation) > 5
              ? "medium"
              : "low";
        result.push({
          tokenSymbol: target.tokenSymbol,
          deviation,
          severity,
          type: "deviation",
        });
      }
    }

    // Concentration alerts: any single token above configured threshold
    for (const item of breakdown) {
      if (item.percent > concentrationThresholdPercent) {
        result.push({
          tokenSymbol: item.symbol,
          deviation: item.percent,
          severity:
            item.percent > highConcentrationThresholdPercent
              ? "high"
              : "medium",
          type: "concentration_token",
        });
      }
    }

    return result;
  }, [
    vault.rebalanceTargets,
    breakdown,
    totals.totalValue,
    concentrationThresholdPercent,
    highConcentrationThresholdPercent,
  ]);

  // ── Client-side category breakdown from vault.tokenCategories ──────
  const categoryBreakdown = useMemo(() => {
    const categories = vault.tokenCategories;
    if (categories.length === 0 || totals.totalValue === 0) return [];

    // Build symbol -> value map from breakdown
    const symbolValueMap: Record<string, number> = {};
    for (const item of breakdown) {
      const sym = item.symbol.toUpperCase();
      symbolValueMap[sym] = (symbolValueMap[sym] || 0) + item.value;
    }

    // Aggregate by category
    const catValueMap: Record<string, number> = {};
    for (const cat of categories) {
      const sym = cat.tokenSymbol.toUpperCase();
      const value = symbolValueMap[sym] ?? 0;
      catValueMap[cat.category] = (catValueMap[cat.category] || 0) + value;
    }

    return Object.entries(catValueMap)
      .filter(([, valueUsd]) => valueUsd > 0)
      .map(([category, valueUsd]) => ({
        category,
        valueUsd,
        percent: (valueUsd / totals.totalValue) * 100,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd);
  }, [vault.tokenCategories, breakdown, totals.totalValue]);

  // ── Refresh handler using hook ─────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshPrices();
      toast(t("dashboard.pricesRefreshed"), "success");
    } catch {
      toast(t("dashboard.failedToRefresh"), "error");
    } finally {
      setRefreshing(false);
    }
  };

  const totalValue = totals.totalValue;
  const totalPL = totals.totalPL;
  const isPriceStale = useMemo(() => {
    if (!lastPriceUpdate) return true;
    return Date.now() - new Date(lastPriceUpdate).getTime() > 30 * 60 * 1000;
  }, [lastPriceUpdate]);
  const deviationAlerts = alerts.filter((a) => a.type === "deviation");
  const concentrationAlerts = alerts.filter(
    (a) => a.type === "concentration_token"
  );
  const deviationAlertTokenCount = useMemo(
    () => new Set(deviationAlerts.map((a) => a.tokenSymbol.toUpperCase())).size,
    [deviationAlerts]
  );
  const concentrationAlertTokenCount = useMemo(
    () => new Set(concentrationAlerts.map((a) => a.tokenSymbol.toUpperCase())).size,
    [concentrationAlerts]
  );
  const mergedAlertBadges = useMemo(() => {
    const severityRank: Record<DashboardAlertSeverity, number> = {
      low: 1,
      medium: 2,
      high: 3,
    };
    const map = new Map<string, {
      tokenSymbol: string;
      severity: DashboardAlertSeverity;
      deviation: number | null;
      concentration: number | null;
    }>();

    for (const alert of alerts) {
      const symbol = alert.tokenSymbol.toUpperCase();
      const existing = map.get(symbol);
      if (!existing) {
        map.set(symbol, {
          tokenSymbol: alert.tokenSymbol,
          severity: alert.severity,
          deviation: alert.type === "deviation" ? alert.deviation : null,
          concentration:
            alert.type === "concentration_token" ? alert.deviation : null,
        });
        continue;
      }

      if (severityRank[alert.severity] > severityRank[existing.severity]) {
        existing.severity = alert.severity;
      }
      if (alert.type === "deviation") {
        existing.deviation = alert.deviation;
      }
      if (alert.type === "concentration_token") {
        existing.concentration = alert.deviation;
      }
    }

    return [...map.values()]
      .map((entry) => ({
        tokenSymbol: entry.tokenSymbol,
        severity: entry.severity,
        value:
          entry.concentration !== null
            ? entry.concentration
            : (entry.deviation ?? 0),
      }))
      .sort(
        (a, b) =>
          severityRank[b.severity] - severityRank[a.severity] ||
          Math.abs(b.value) - Math.abs(a.value)
      );
  }, [alerts]);

  // Filter history by time range
  const filteredHistory = useMemo(() => {
    const rangeMs = getTimeRangeMs(timeRange);
    if (!rangeMs || history.length === 0) return history;
    const cutoff = Date.now() - rangeMs;
    const filtered = history.filter((h) => new Date(h.date).getTime() >= cutoff);
    return filtered.length > 0 ? filtered : history;
  }, [history, timeRange]);

  // Pie chart data - directly use breakdown (already per-token)
  const pieData = useMemo(() => {
    return breakdown.map((item) => ({
      symbol: item.symbol,
      value: item.value,
      percent: item.percent,
      color: item.color,
    }));
  }, [breakdown]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
          <p className="text-text-subtle">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastPriceUpdate && (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                isPriceStale
                  ? "border-status-warning-border bg-status-warning-soft text-status-warning"
                  : "border-status-positive-border bg-status-positive-soft text-status-positive"
              }`}
            >
              {t("dashboard.prices", { time: formatTimeAgo(new Date(lastPriceUpdate)) })}
            </span>
          )}
          {/* Report download removed — no server-side report generation in vault architecture */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("dashboard.refresh")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-text-subtle">{t("dashboard.totalValue")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatValue(totalValue)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-text-subtle">{t("dashboard.totalPL")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                totalPL >= 0 ? "text-status-positive" : "text-status-negative"
              }`}
            >
              {totalPL >= 0 ? "+" : ""}
              {formatUsd(totalPL)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-text-subtle">{t("dashboard.totalFees")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-status-caution">
              {formatUsd(totals.totalFeesPaid)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-text-subtle">{t("dashboard.assets")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{breakdown.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-text-subtle">{t("portfolio.change24h")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                totals.change24h >= 0 ? "text-status-positive" : "text-status-negative"
              }`}
            >
              {totals.change24h >= 0 ? "+" : ""}
              {totals.change24h.toFixed(2)}%
            </p>
            <p className="mt-1 text-xs text-text-dim">{t("portfolio.weightedChangeDesc")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Rebalance Status Card */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-status-warning" />
                {t("dashboard.rebalanceStatus")}
              </CardTitle>
              <Link
                href="/rebalance"
                className="text-sm text-status-info hover:text-status-info"
              >
                {t("dashboard.viewDetails")}
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deviationAlerts.length > 0 && (
                <p className="text-sm text-text-muted">
                  {t("dashboard.tokensNeedRebalancing", { count: deviationAlertTokenCount.toString() })}
                </p>
              )}
              {concentrationAlerts.length > 0 && (
                <p className="text-sm text-text-muted">
                  {t("dashboard.concentrationAlerts", {
                    count: concentrationAlertTokenCount.toString(),
                    threshold: concentrationThresholdLabel,
                  })}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {mergedAlertBadges.slice(0, 5).map((alert) => (
                  <span
                    key={alert.tokenSymbol}
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      alert.severity === "high"
                        ? "bg-status-negative-soft text-status-negative"
                        : alert.severity === "medium"
                          ? "bg-status-warning-soft text-status-warning"
                          : "bg-status-info-soft text-status-info"
                    }`}
                  >
                    {alert.tokenSymbol}: {alert.value >= 0 ? "+" : ""}{alert.value.toFixed(1)}%
                  </span>
                ))}
                {mergedAlertBadges.length > 5 && (
                  <span className="text-xs text-text-subtle">
                    {t("common.more", { count: (mergedAlertBadges.length - 5).toString() })}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics — using useAnalytics() */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t("dashboard.performance")}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-text-subtle">{t("dashboard.totalInvested")}</p>
              <p className="text-lg font-semibold text-text-primary">
                {formatUsd(analytics.totalInvested)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-subtle">{t("dashboard.currentValue")}</p>
              <p className="text-lg font-semibold text-text-primary">
                {formatUsd(analytics.totalValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-subtle">{t("dashboard.simpleROI")}</p>
              <p className={`text-lg font-semibold ${analytics.totalReturnPercent >= 0 ? "text-status-positive" : "text-status-negative"}`}>
                {analytics.totalReturnPercent >= 0 ? "+" : ""}{analytics.totalReturnPercent.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-text-subtle">{t("dashboard.assets")}</p>
              <p className="text-lg font-semibold text-text-primary">
                {analytics.numberOfTokens}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.tokenAllocation")}</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <AllocationPieChart data={pieData} />
            ) : (
              <p className="py-8 text-center text-text-subtle">
                {t("dashboard.addTransactionsToSee")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("dashboard.portfolioHistory")}</CardTitle>
              <div className="flex gap-1">
                {TIME_RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setTimeRange(r.value)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      timeRange === r.value
                        ? "bg-accent text-bg-page shadow-sm"
                        : "text-text-subtle hover:bg-bg-hover hover:text-text-tertiary"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredHistory.length > 0 ? (
              <PortfolioLineChart data={filteredHistory} />
            ) : (
              <p className="py-8 text-center text-text-subtle">
                {t("dashboard.noHistoryYet")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.categoryBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <Bar
                data={{
                  labels: categoryBreakdown.map((cb) => cb.category),
                  datasets: [
                    {
                      label: t("dashboard.allocationPercent"),
                      data: categoryBreakdown.map((cb) => cb.percent),
                      backgroundColor: [
                        "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444",
                        "#ec4899", "#06b6d4", "#84cc16", "#f97316",
                      ],
                      borderRadius: 4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  indexAxis: "y",
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: chartTheme.tooltipBg,
                      titleColor: chartTheme.tooltipText,
                      bodyColor: chartTheme.tooltipText,
                      borderColor: chartTheme.tooltipBorder,
                      borderWidth: 1,
                      callbacks: {
                        label: (item) => `${(item.raw as number).toFixed(1)}%`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      grid: { color: chartTheme.gridColor },
                      ticks: { color: chartTheme.tickColor, callback: (v) => `${v}%` },
                    },
                    y: {
                      grid: { display: false },
                      ticks: { color: chartTheme.tickColor, font: { size: 12 } },
                    },
                  },
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.holdings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {breakdown.map((item) => (
                <div
                  key={item.holdingKey}
                  className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-input px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <div>
                      <p className="font-medium">{item.symbol}</p>
                      <p className="text-xs text-text-subtle">
                        {formatCrypto(item.quantity)} @ {formatUsdPrice(item.avgCost)} {t("dashboard.avg")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatValue(item.value)}</p>
                    <p
                      className={`text-xs ${
                        item.unrealizedPL >= 0 ? "text-status-positive" : "text-status-negative"
                      }`}
                    >
                      {item.unrealizedPL >= 0 ? "+" : ""}
                      {formatUsd(item.unrealizedPL)} ({item.unrealizedPLPercent >= 0 ? "+" : ""}
                      {item.unrealizedPLPercent.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
