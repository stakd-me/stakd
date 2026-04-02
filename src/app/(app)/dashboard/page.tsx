"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AccessibleChartFrame } from "@/components/ui/accessible-chart-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { StatusBanner } from "@/components/ui/status-banner";
import { SummaryStrip } from "@/components/ui/summary-strip";
import { KpiCard } from "@/components/ui/kpi-card";
import { PriceFlash } from "@/components/ui/price-flash";
import { CardSectionHeader } from "@/components/ui/card-section-header";
import { cn, formatUsd, formatUsdPrice, formatCrypto, formatTimeAgo } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { useTranslation } from "@/hooks/use-translation";
import dynamic from "next/dynamic";

const AllocationPieChart = dynamic(
  () => import("@/components/charts/allocation-pie").then((m) => ({ default: m.AllocationPieChart })),
  { ssr: false }
);
const PortfolioLineChart = dynamic(
  () => import("@/components/charts/portfolio-line").then((m) => ({ default: m.PortfolioLineChart })),
  { ssr: false }
);
import { AlertTriangle, CheckCircle2, Scale, TrendingUp } from "lucide-react";
import { useState, useMemo } from "react";

const CategoryBarChart = dynamic(
  () => import("@/components/charts/category-bar").then((m) => ({ default: m.CategoryBarChart })),
  { ssr: false }
);
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { MarketSignalBanner } from "@/components/dashboard/market-signal-banner";
import { AlertsSection } from "@/components/dashboard/alerts-section";
import { useMarketSignal } from "@/hooks/use-market-signal";
import { useAlertEngine } from "@/hooks/use-alert-engine";
import Link from "next/link";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePrices } from "@/hooks/use-prices";
import { useAnalytics } from "@/hooks/use-analytics";
import { useVaultStore } from "@/lib/store";
import {
  getHighConcentrationThresholdPercent,
  parseConcentrationAlertThresholdPercent,
} from "@/lib/constants/risk";
import { buildStablecoinSymbolSet } from "@/lib/constants/stablecoins";
import {
  buildStrategyContext,
  dispatchStrategy,
} from "@/lib/services/rebalance-strategies";
import type { RebalanceStrategy } from "@/components/rebalance/types";

type TimeRange = "24h" | "7d" | "30d" | "90d" | "1y" | "all";
type DashboardAlertSeverity = "low" | "medium" | "high";
type DashboardAlertType = "deviation" | "concentration_token";

interface DashboardAlert {
  tokenSymbol: string;
  deviation: number;
  severity: DashboardAlertSeverity;
  type: DashboardAlertType;
  smartHint?: string; // profit/loss-aware suggestion
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
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const { format: formatValue } = useCurrency();
  const { t } = useTranslation();
  // ── Client-side data from vault store + hooks ──────────────────────
  const { holdings, breakdown, totals, history, lastPriceUpdate, isLoading } = usePortfolio();
  const { priceMap } = usePrices();
  const analytics = useAnalytics(holdings);
  const { data: marketSignal } = useMarketSignal();
  const vault = useVaultStore((s) => s.vault);
  const rebalanceStrategy = (vault.settings.rebalanceStrategy || "percent-of-portfolio") as RebalanceStrategy;
  const parsedHoldZonePercent = parseFloat(vault.settings.holdZonePercent || "5");
  const holdZonePercent = Number.isFinite(parsedHoldZonePercent) ? parsedHoldZonePercent : 5;
  const concentrationThresholdPercent = parseConcentrationAlertThresholdPercent(
    vault.settings.concentrationThresholdPercent
  );
  const excludeStablecoinsFromConcentration =
    vault.settings.excludeStablecoinsFromConcentration === "1";
  const highConcentrationThresholdPercent = getHighConcentrationThresholdPercent(
    concentrationThresholdPercent
  );
  const stablecoinSymbols = useMemo(
    () => buildStablecoinSymbolSet(vault.tokenCategories),
    [vault.tokenCategories]
  );

  // Alert engine — uses data already loaded above, no duplicate hooks
  const {
    alerts: ruleAlerts,
    totalAlertCount: ruleAlertCount,
    dismiss: dismissAlert,
    dismissAll: dismissAllAlerts,
  } = useAlertEngine({
    alertRulesJson: vault.settings.alertRules,
    breakdown,
    totalValueUsd: totals.totalValue,
    tokenCategories: vault.tokenCategories,
    marketSignal: marketSignal ?? undefined,
  });

  const strategyContext = useMemo(() => {
    if (vault.rebalanceTargets.length === 0 || Object.keys(priceMap).length === 0) {
      return null;
    }
    try {
      return buildStrategyContext(vault, priceMap);
    } catch {
      return null;
    }
  }, [vault, priceMap]);

  const strategyOutput = useMemo(() => {
    if (!strategyContext) return null;
    try {
      return dispatchStrategy(rebalanceStrategy, strategyContext, vault.settings);
    } catch {
      return null;
    }
  }, [rebalanceStrategy, strategyContext, vault.settings]);

  // Build symbol → P&L lookup for smart rebalance hints
  const holdingPLMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of breakdown) {
      map[item.symbol.toUpperCase()] = item.unrealizedPLPercent;
    }
    return map;
  }, [breakdown]);

  const marketPhase = marketSignal?.composite.phase ?? null;

  // Keep "need rebalancing" consistent with the Rebalance page execution logic.
  // Enhanced with smart profit/loss-aware suggestions.
  const deviationAlerts = useMemo(() => {
    const suggestions = strategyOutput?.suggestions ?? [];
    return suggestions
      .filter((suggestion) => suggestion.action !== "hold")
      .map((suggestion) => {
        const absDeviation = Math.abs(suggestion.deviation);
        const severity: DashboardAlertSeverity =
          absDeviation > holdZonePercent * 3
            ? "high"
            : absDeviation > holdZonePercent * 2
              ? "medium"
              : "low";

        // Smart hint based on profit/loss state
        const plPercent = holdingPLMap[suggestion.tokenSymbol.toUpperCase()] ?? 0;
        let smartHint: string | undefined;

        if (suggestion.action === "sell" && suggestion.deviation > 0) {
          // Overweight
          if (plPercent >= 0) {
            smartHint = t("dashboard.smartHintOverweightProfit", {
              symbol: suggestion.tokenSymbol,
              pl: plPercent.toFixed(1),
            });
          } else {
            smartHint = t("dashboard.smartHintOverweightLoss", {
              symbol: suggestion.tokenSymbol,
              pl: Math.abs(plPercent).toFixed(1),
            });
          }
        } else if (suggestion.action === "buy" && suggestion.deviation < 0) {
          // Underweight
          if (marketPhase === "danger") {
            smartHint = t("dashboard.smartHintUnderweightDanger", {
              symbol: suggestion.tokenSymbol,
            });
          } else {
            smartHint = t("dashboard.smartHintUnderweightBuy", {
              symbol: suggestion.tokenSymbol,
            });
          }
        }

        return {
          tokenSymbol: suggestion.tokenSymbol,
          deviation: suggestion.deviation,
          severity,
          type: "deviation" as const,
          smartHint,
        };
      });
  }, [strategyOutput, holdZonePercent, holdingPLMap, marketPhase, t]);

  const concentrationAlerts = (() => {
    const result: DashboardAlert[] = [];
    for (const item of breakdown) {
      const normalizedSymbol = item.symbol.toUpperCase();
      if (
        excludeStablecoinsFromConcentration &&
        stablecoinSymbols.has(normalizedSymbol)
      ) {
        continue;
      }
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
  })();

  const alerts = [...deviationAlerts, ...concentrationAlerts];

  // ── Client-side category breakdown from vault.tokenCategories ──────
  const categoryBreakdown = (() => {
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
  })();

  const totalValue = totals.totalValue;
  const totalPL = totals.totalPL;
  const change24hUsdt = (totals.totalValue * totals.change24h) / 100;
  const topHoldings = useMemo(
    () => [...breakdown].sort((a, b) => b.value - a.value).slice(0, 6),
    [breakdown]
  );
  const remainingHoldingsCount = Math.max(0, breakdown.length - topHoldings.length);
  const [now] = useState(() => Date.now());
  const isPriceStale = useMemo(() => {
    if (!lastPriceUpdate) return true;
    return now - new Date(lastPriceUpdate).getTime() > 60 * 1000;
  }, [lastPriceUpdate, now]);
  const mergedAlertBadges = (() => {
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
      smartHint?: string;
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
          smartHint: alert.smartHint,
        });
        continue;
      }

      if (severityRank[alert.severity] > severityRank[existing.severity]) {
        existing.severity = alert.severity;
      }
      if (alert.type === "deviation") {
        existing.deviation = alert.deviation;
        if (alert.smartHint) existing.smartHint = alert.smartHint;
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
        smartHint: entry.smartHint,
      }))
      .sort(
        (a, b) =>
          severityRank[b.severity] - severityRank[a.severity] ||
          Math.abs(b.value) - Math.abs(a.value)
      );
  })();
  const hasAlerts = alerts.length > 0;
  const primaryAlert = mergedAlertBadges[0] ?? null;
  const highestAlertSeverity = primaryAlert?.severity ?? "low";
  const severityLabels: Record<DashboardAlertSeverity, string> = {
    high: t("common.severityHigh"),
    medium: t("common.severityMedium"),
    low: t("common.severityLow"),
  };

  // Filter history by time range
  const filteredHistory = useMemo(() => {
    const rangeMs = getTimeRangeMs(timeRange);
    if (!rangeMs || history.length === 0) return history;
    const cutoff = now - rangeMs;
    const filtered = history.filter((h) => new Date(h.date).getTime() >= cutoff);
    return filtered.length > 0 ? filtered : history;
  }, [history, timeRange, now]);

  // Pie chart data - directly use breakdown (already per-token)
  const pieData = useMemo(() => {
    return breakdown.map((item) => ({
      symbol: item.symbol,
      value: item.value,
      percent: item.percent,
      color: item.color,
    }));
  }, [breakdown]);
  const historyChartSummary = useMemo(() => {
    if (filteredHistory.length === 0) return "";
    const firstPoint = filteredHistory[0];
    const lastPoint = filteredHistory[filteredHistory.length - 1];
    return t("dashboard.historyChartSummary", {
      count: filteredHistory.length,
      start: new Date(firstPoint.date).toLocaleDateString(),
      end: new Date(lastPoint.date).toLocaleDateString(),
      latest: formatUsd(lastPoint.value),
    });
  }, [filteredHistory, t]);
  const allocationChartSummary = useMemo(() => {
    if (pieData.length === 0) return "";
    const largestHolding = topHoldings[0];
    return t("dashboard.allocationChartSummary", {
      count: pieData.length,
      symbol: largestHolding?.symbol ?? "-",
      percent: largestHolding?.percent.toFixed(1) ?? "0.0",
    });
  }, [pieData.length, t, topHoldings]);
  const categoryChartSummary = useMemo(() => {
    if (categoryBreakdown.length === 0) return "";
    const largestCategory = categoryBreakdown[0];
    return t("dashboard.categoryChartSummary", {
      count: categoryBreakdown.length,
      category: largestCategory.category,
      percent: largestCategory.percent.toFixed(1),
    });
  }, [categoryBreakdown, t]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <KpiCard
          label={t("dashboard.totalValue")}
          value={<PriceFlash value={totalValue}>{formatValue(totalValue)}</PriceFlash>}
          valueSize="3xl"
          secondary={
            lastPriceUpdate && isPriceStale
              ? t("dashboard.prices", {
                  time: formatTimeAgo(new Date(lastPriceUpdate)),
                })
              : undefined
          }
          secondaryTone={isPriceStale ? "warning" : "muted"}
          className="xl:col-span-2"
        />

        <KpiCard
          label={t("dashboard.totalPL")}
          value={<PriceFlash value={totalPL}>{`${totalPL >= 0 ? "+" : ""}${formatUsd(totalPL)}`}</PriceFlash>}
          valueTone={totalPL >= 0 ? "positive" : "negative"}
          valueSize="3xl"
          secondary={`${analytics.totalReturnPercent >= 0 ? "+" : ""}${analytics.totalReturnPercent.toFixed(2)}% ${t("dashboard.simpleROI")}`}
          secondaryTone={analytics.totalReturnPercent >= 0 ? "positive" : "negative"}
        />

        <KpiCard
          label={t("portfolio.change24h")}
          value={<PriceFlash value={totals.change24h}>{`${totals.change24h >= 0 ? "+" : ""}${totals.change24h.toFixed(2)}%`}</PriceFlash>}
          valueTone={totals.change24h >= 0 ? "positive" : "negative"}
          valueSize="3xl"
          secondary={`${change24hUsdt >= 0 ? "+" : ""}${formatUsd(change24hUsdt)} USDT`}
          secondaryTone={change24hUsdt >= 0 ? "positive" : "negative"}
          tertiary={t("portfolio.weightedChangeDesc")}
        />
      </div>

      <MarketSignalBanner />

      <AlertsSection
        alerts={ruleAlerts}
        totalAlertCount={ruleAlertCount}
        onDismiss={dismissAlert}
        onDismissAll={dismissAllAlerts}
      />

      <StatusBanner
        tone={
          hasAlerts
            ? highestAlertSeverity === "high"
              ? "danger"
              : "warning"
            : "success"
        }
        heading={t("dashboard.rebalanceStatus")}
        icon={
          hasAlerts ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )
        }
        action={
          <Link href="/rebalance">
            <Button size="sm" variant={hasAlerts ? "default" : "outline"}>
              <Scale className="mr-2 h-4 w-4" />
              {t("dashboard.viewDetails")}
            </Button>
          </Link>
        }
        description={
          hasAlerts ? t("dashboard.actionRequired") : t("dashboard.noRebalanceAlerts")
        }
      >
        {hasAlerts ? (
          <div className="flex flex-wrap gap-2">
            {mergedAlertBadges.slice(0, 8).map((alert) => (
              <div key={alert.tokenSymbol} className="flex flex-col gap-0.5">
                <StatusPill
                  tone={
                    alert.severity === "high"
                      ? "danger"
                      : alert.severity === "medium"
                        ? "warning"
                        : "info"
                  }
                  bordered={false}
                >
                  {severityLabels[alert.severity]}: {alert.tokenSymbol} {alert.value >= 0 ? "+" : ""}
                  {alert.value.toFixed(1)}%
                </StatusPill>
                {alert.smartHint && (
                  <span className="max-w-48 text-[10px] leading-tight text-text-dim">
                    {alert.smartHint}
                  </span>
                )}
              </div>
            ))}
            {mergedAlertBadges.length > 8 ? (
              <span className="text-xs text-text-subtle">
                {t("common.more", {
                  count: (mergedAlertBadges.length - 8).toString(),
                })}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-text-subtle">
            {t("dashboard.portfolioWithinThresholds")}
          </p>
        )}
      </StatusBanner>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <Card>
          <CardSectionHeader
            title={t("dashboard.portfolioHistory")}
            actions={
              <div
                role="group"
                aria-label={t("dashboard.timeRangeSelector")}
                className="flex flex-wrap gap-1"
              >
                {TIME_RANGES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setTimeRange(r.value)}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      timeRange === r.value
                        ? "bg-accent text-bg-page shadow-sm"
                        : "text-text-subtle hover:bg-bg-hover hover:text-text-tertiary"
                    )}
                    aria-pressed={timeRange === r.value}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            }
          />
          <CardContent>
            {filteredHistory.length > 0 ? (
              <AccessibleChartFrame
                summary={historyChartSummary}
              >
                <PortfolioLineChart data={filteredHistory} />
              </AccessibleChartFrame>
            ) : (
              <EmptyState
                title={t("dashboard.noHistoryYet")}
                description={t("dashboard.historyEmptyHelp")}
                icon={<TrendingUp className="h-5 w-5" />}
                action={
                  <Link href="/portfolio/add">
                    <Button size="sm">
                      {t("portfolio.addTransaction")}
                    </Button>
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.tokenAllocation")}</CardTitle>
            </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <AccessibleChartFrame
                title={t("dashboard.tokenAllocation")}
                summary={allocationChartSummary}
              >
                <AllocationPieChart data={pieData} />
              </AccessibleChartFrame>
            ) : (
              <EmptyState
                  title={t("dashboard.addTransactionsToSee")}
                  description={t("dashboard.allocationEmptyHelp")}
                  icon={<Scale className="h-5 w-5" />}
                  action={
                    <Link href="/portfolio">
                      <Button size="sm" variant="outline">
                        {t("portfolio.title")}
                      </Button>
                    </Link>
                  }
                  className="py-8"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t("dashboard.performance")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryStrip
                items={[
                  {
                    key: "invested",
                    label: t("dashboard.totalInvested"),
                    value: formatUsd(analytics.totalInvested),
                  },
                  {
                    key: "roi",
                    label: t("dashboard.simpleROI"),
                    value: `${analytics.totalReturnPercent >= 0 ? "+" : ""}${analytics.totalReturnPercent.toFixed(2)}%`,
                    tone: analytics.totalReturnPercent >= 0 ? "positive" : "negative",
                  },
                  {
                    key: "fees",
                    label: t("dashboard.totalFees"),
                    value: formatUsd(totals.totalFeesPaid),
                  },
                  {
                    key: "assets",
                    label: t("dashboard.assets"),
                    value: breakdown.length,
                  },
                ]}
                columnsClassName="grid-cols-2"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-6",
          categoryBreakdown.length > 0 && topHoldings.length > 0
            ? "xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
            : ""
        )}
      >
        {categoryBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.categoryBreakdown")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AccessibleChartFrame
                title={t("dashboard.categoryBreakdown")}
                summary={categoryChartSummary}
              >
                <CategoryBarChart
                  data={categoryBreakdown}
                  allocationLabel={t("dashboard.allocationPercent")}
                />
              </AccessibleChartFrame>
            </CardContent>
          </Card>
        )}

        {topHoldings.length > 0 && (
          <Card>
            <CardSectionHeader
              title={t("dashboard.holdings")}
              actions={
                <Link href="/portfolio">
                  <Button size="sm" variant="outline">
                    {t("portfolio.title")}
                  </Button>
                </Link>
              }
            />
            <CardContent>
              <div className="space-y-3">
                {topHoldings.map((item) => (
                  <div
                    key={item.holdingKey}
                    className="flex flex-col gap-3 rounded-md border border-border-subtle bg-bg-input px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <div>
                        <p className="font-medium text-text-primary">
                          {item.symbol}
                        </p>
                        <p className="text-xs text-text-subtle">
                          {formatCrypto(item.quantity)} @ {formatUsdPrice(item.avgCost)} {t("dashboard.avg")}
                        </p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-medium text-text-primary">
                        {formatValue(item.value)}
                      </p>
                      <p className="text-xs text-text-subtle">
                        {item.percent.toFixed(1)}%
                      </p>
                      <p
                        className={cn(
                          "text-xs",
                          item.unrealizedPL >= 0
                            ? "text-status-positive"
                            : "text-status-negative"
                        )}
                      >
                        {item.unrealizedPL >= 0 ? "+" : ""}
                        {formatUsd(item.unrealizedPL)} (
                        {item.unrealizedPLPercent >= 0 ? "+" : ""}
                        {item.unrealizedPLPercent.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                ))}
                {remainingHoldingsCount > 0 ? (
                  <p className="text-xs text-text-subtle">
                    {t("common.more", {
                      count: remainingHoldingsCount.toString(),
                    })}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
