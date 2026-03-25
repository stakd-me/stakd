"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessibleChartFrame } from "@/components/ui/accessible-chart-frame";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineHelpCard } from "@/components/ui/inline-help";
import { PageHeader } from "@/components/ui/page-header";
import { SectionNavigator, SectionPanel } from "@/components/ui/section-navigator";
import { StatusPill } from "@/components/ui/status-pill";
import { SummaryStrip } from "@/components/ui/summary-strip";
import { CardSectionHeader } from "@/components/ui/card-section-header";
import dynamic from "next/dynamic";

const PortfolioLineChart = dynamic(
  () => import("@/components/charts/portfolio-line").then((m) => ({ default: m.PortfolioLineChart })),
  { ssr: false }
);
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { useVaultStore } from "@/lib/store";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useTranslation } from "@/hooks/use-translation";
import {
  type PortfolioPeriodReport,
  type ReportPeriod,
  computePortfolioReport,
} from "@/lib/services/reporting";
import { cn, formatUsd } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import Link from "next/link";
import { BookOpen, Download } from "lucide-react";

const PERIOD_OPTIONS: ReportPeriod[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "all-time",
];

type ReportsSection = "overview" | "activity" | "risk" | "holdings" | "all";

function getSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getSignedCurrency(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatUsd(value)}`;
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getDataQualityTone(
  level: PortfolioPeriodReport["dataQuality"]["level"]
): "success" | "caution" | "danger" {
  if (level === "exact") {
    return "success";
  }
  if (level === "estimated") {
    return "caution";
  }
  return "danger";
}

function toCsv(report: PortfolioPeriodReport): string {
  const rows: string[][] = [
    ["Report Label", report.window.label],
    ["Generated At", report.generatedAt],
    ["Window Start", report.window.startIso],
    ["Window End", report.window.endIso],
    ["Start Value USD", String(report.summary.startValueUsd)],
    ["End Value USD", String(report.summary.endValueUsd)],
    ["Capital Net Flow USD", String(report.summary.capitalNetFlowUsd)],
    ["External Net Flow USD", String(report.summary.externalNetFlowUsd)],
    ["Trading Turnover USD", String(report.summary.tradingTurnoverUsd)],
    ["Net Flow USD (Legacy Alias)", String(report.summary.netFlowUsd)],
    ["PnL USD", String(report.summary.pnlUsd)],
    ["Return Percent (Modified Dietz)", String(report.summary.returnPercent)],
    ["Simple Return Percent", String(report.summary.simpleReturnPercent)],
    ["Reconciliation Gap USD", String(report.summary.reconciliationGapUsd)],
    ["Max Drawdown Percent", String(report.summary.maxDrawdownPercent)],
    [
      "Annualized Volatility Percent",
      String(report.summary.annualizedVolatilityPercent),
    ],
    ["Transactions", String(report.activity.transactionCount)],
    [
      "Estimated Amount Transactions",
      String(report.activity.estimatedAmountTransactionCount),
    ],
    [
      "Unknown Amount Transactions",
      String(report.activity.unknownAmountTransactionCount),
    ],
    ["Buy Volume USD", String(report.activity.buyVolumeUsd)],
    ["Sell Volume USD", String(report.activity.sellVolumeUsd)],
    ["Receive Volume USD", String(report.activity.receiveVolumeUsd)],
    ["Send Volume USD", String(report.activity.sendVolumeUsd)],
    ["Total Fees USD", String(report.activity.totalFeesUsd)],
    ["Active Assets", String(report.risk.activeAssets)],
    ["Top Concentration Symbol", report.risk.topConcentrationSymbol ?? ""],
    ["Top Concentration Percent", String(report.risk.topConcentrationPercent)],
    ["Herfindahl Index", String(report.risk.herfindahlIndex)],
    ["Diversification Score", String(report.risk.diversificationScore)],
  ];

  rows.push([]);
  rows.push([
    "Top Holding Symbol",
    "Value USD",
    "Percent",
    "Held Days",
    "Unrealized PnL USD",
    "Unrealized PnL Per Held Day USD",
    "Unrealized PnL Percent",
  ]);

  for (const row of report.topHoldings) {
    rows.push([
      row.symbol,
      String(row.valueUsd),
      String(row.percent),
      String(row.heldDays),
      String(row.unrealizedPLUsd),
      String(row.unrealizedPnlPerHeldDayUsd),
      String(row.unrealizedPLPercent),
    ]);
  }

  return rows
    .map((row) =>
      row
        .map((field) =>
          field.includes(",") || field.includes('"') || field.includes("\n")
            ? `"${field.replace(/"/g, '""')}"`
            : field
        )
        .join(",")
    )
    .join("\n");
}

export default function ReportsPage() {
  const sectionsBaseId = "reports-sections";
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [activeSection, setActiveSection] = useState<ReportsSection>("overview");
  const { format: formatValue } = useCurrency();
  const { t } = useTranslation();
  const vault = useVaultStore((s) => s.vault);
  const { holdings, totals, isLoading } = usePortfolio();
  const periodLabels: Record<ReportPeriod, string> = {
    weekly: t("reports.periodWeek"),
    monthly: t("reports.periodMonth"),
    quarterly: t("reports.periodQuarter"),
    yearly: t("reports.periodYear"),
    "all-time": t("reports.periodAllTime"),
  };
  const dataQualityLabels: Record<PortfolioPeriodReport["dataQuality"]["level"], string> = {
    exact: t("reports.dataQualityExact"),
    estimated: t("reports.dataQualityEstimated"),
    incomplete: t("reports.dataQualityIncomplete"),
  };

  const report = useMemo(
    () =>
      computePortfolioReport({
        vault,
        holdings,
        currentTotalValueUsd: totals.totalValue,
        period,
      }),
    [vault, holdings, totals.totalValue, period]
  );

  const reportTimeline = useMemo(
    () => report.timeline.map((point) => ({ date: point.date, value: point.value })),
    [report.timeline]
  );

  const returnDelta = roundTo(
    report.summary.returnPercent - report.previousSummary.returnPercent,
    2
  );
  const pnlDelta = roundTo(
    report.summary.pnlUsd - report.previousSummary.pnlUsd,
    2
  );
  const showPreviousComparison = period !== "all-time";
  const reconciledEnd = roundTo(
    report.summary.startValueUsd + report.summary.capitalNetFlowUsd + report.summary.pnlUsd,
    2
  );
  const reconciliationGapAbs = Math.abs(report.summary.reconciliationGapUsd);
  const reconciliationClass =
    reconciliationGapAbs <= 0.01
      ? "border-status-positive-border bg-status-positive-soft text-status-positive"
      : reconciliationGapAbs <= 1
        ? "border-status-warning-border bg-status-warning-soft text-status-warning"
        : "border-status-negative-border bg-status-negative-soft text-status-negative";
  const showOverviewSection =
    activeSection === "all" || activeSection === "overview";
  const showActivitySection =
    activeSection === "all" || activeSection === "activity";
  const showRiskSection = activeSection === "all" || activeSection === "risk";
  const showHoldingsSection =
    activeSection === "all" || activeSection === "holdings";
  const sectionOptions = useMemo(
    () => [
      {
        value: "overview" as const,
        label: t("reports.sectionOverview"),
        count: 4,
      },
      {
        value: "activity" as const,
        label: t("reports.sectionActivity"),
        count: 4,
      },
      {
        value: "risk" as const,
        label: t("reports.sectionRisk"),
        count: 4,
      },
      {
        value: "holdings" as const,
        label: t("reports.sectionHoldings"),
        count: report.topHoldings.length,
      },
      {
        value: "all" as const,
        label: t("reports.sectionAll"),
        count: 12 + report.topHoldings.length,
      },
    ],
    [report.topHoldings.length, t]
  );
  const timelineChartSummary = useMemo(() => {
    if (reportTimeline.length === 0) return "";
    const firstPoint = reportTimeline[0];
    const lastPoint = reportTimeline[reportTimeline.length - 1];
    return t("reports.timelineChartSummary", {
      count: reportTimeline.length,
      start: new Date(firstPoint.date).toLocaleDateString(),
      end: new Date(lastPoint.date).toLocaleDateString(),
      latest: formatUsd(lastPoint.value),
    });
  }, [reportTimeline, t]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reports.title")}
        description={t("reports.subtitle")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                triggerDownload(
                  `portfolio-report-${report.period}-${report.window.label}.json`,
                  JSON.stringify(report, null, 2),
                  "application/json"
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {t("reports.exportJson")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                triggerDownload(
                  `portfolio-report-${report.period}-${report.window.label}.csv`,
                  toCsv(report),
                  "text/csv;charset=utf-8"
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {t("reports.exportCsv")}
            </Button>
          </>
        }
      />

      <div
        role="group"
        aria-label={t("reports.periodSelector")}
        className="flex flex-wrap gap-2"
      >
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPeriod(option)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page ${
              period === option
                ? "border-border-subtle bg-bg-hover text-text-primary"
                : "border-border-subtle bg-bg-card text-text-subtle hover:bg-bg-hover hover:text-text-primary"
            }`}
            aria-pressed={period === option}
          >
            {periodLabels[option]}
          </button>
        ))}
      </div>

      <SectionNavigator
        baseId={sectionsBaseId}
        label={t("reports.focusView")}
        description={report.window.label}
        value={activeSection}
        onChange={setActiveSection}
        options={sectionOptions}
        columnsClassName="grid-cols-2 xl:grid-cols-5"
      />

      <SectionPanel baseId={sectionsBaseId} value={activeSection}>
      <InlineHelpCard
        icon={<BookOpen className="h-4 w-4" />}
        title={t("reports.inlineHelpTitle")}
        description={t("reports.inlineHelpDescription")}
        items={[
          t("reports.inlineHelpOverview"),
          t("reports.inlineHelpReconciliation"),
          t("reports.inlineHelpActivity"),
        ]}
        action={
          <Link href="/guide#reports">
            <Button variant="ghost" size="sm" className="h-auto px-0 py-0 text-current hover:bg-transparent">
              {t("reports.openGuide")}
            </Button>
          </Link>
        }
      />

      {showOverviewSection && (
        <>
          <Card>
            <CardSectionHeader
              title={report.window.label}
              subtitle={`${t("reports.returnModifiedDietz")}, ${t("reports.periodPL")}, ${t("reports.reconciliation")}`}
              actions={
                <StatusPill
                  tone={getDataQualityTone(report.dataQuality.level)}
                  className="py-1 font-semibold"
                >
                  {t("reports.dataQuality")}: {dataQualityLabels[report.dataQuality.level]}
                </StatusPill>
              }
            />
            <CardContent className="space-y-4">
              <SummaryStrip
                items={[
                  {
                    key: "end-value",
                    label: t("reports.endValue"),
                    value: formatValue(report.summary.endValueUsd),
                    hint: `${t("reports.startValue")}: ${formatValue(report.summary.startValueUsd)}`,
                    valueClassName: "text-2xl font-bold",
                  },
                  {
                    key: "period-pl",
                    label: t("reports.periodPL"),
                    value: getSignedCurrency(report.summary.pnlUsd),
                    hint: showPreviousComparison
                      ? `${t("reports.previousPnlDelta")}: ${getSignedCurrency(pnlDelta)}`
                      : undefined,
                    tone: report.summary.pnlUsd >= 0 ? "positive" : "negative",
                    valueClassName: "text-2xl font-bold",
                  },
                  {
                    key: "return",
                    label: t("reports.returnModifiedDietz"),
                    value: getSignedPercent(report.summary.returnPercent),
                    hint: (
                      <>
                        <p>{t("reports.simple")}: {getSignedPercent(report.summary.simpleReturnPercent)}</p>
                        {showPreviousComparison ? (
                          <p>{t("reports.deltaVsPreviousToDate")}: {getSignedPercent(returnDelta)}</p>
                        ) : null}
                      </>
                    ),
                    tone: report.summary.returnPercent >= 0 ? "positive" : "negative",
                    valueClassName: "text-2xl font-bold",
                  },
                  {
                    key: "drawdown",
                    label: t("reports.maxDrawdown"),
                    value: `-${report.summary.maxDrawdownPercent.toFixed(2)}%`,
                    hint: `${t("reports.volatility")}: ${report.summary.annualizedVolatilityPercent.toFixed(2)}%`,
                    tone: "negative",
                    valueClassName: "text-2xl font-bold",
                  },
                ]}
                columnsClassName="md:grid-cols-2 xl:grid-cols-4"
              />

              <SummaryStrip
                items={[
                  {
                    key: "capital-flow",
                    label: t("reports.capitalNetFlow"),
                    value: getSignedCurrency(report.summary.capitalNetFlowUsd),
                  },
                  {
                    key: "external-flow",
                    label: t("reports.externalNetFlow"),
                    value: getSignedCurrency(report.summary.externalNetFlowUsd),
                  },
                  {
                    key: "turnover",
                    label: t("reports.tradingTurnover"),
                    value: formatValue(report.summary.tradingTurnoverUsd),
                  },
                  {
                    key: "fees",
                    label: t("reports.totalFees"),
                    value: formatUsd(report.activity.totalFeesUsd),
                  },
                ]}
                columnsClassName="md:grid-cols-2 xl:grid-cols-4"
              />

              <div className={`rounded-lg border px-4 py-3 text-sm ${reconciliationClass}`}>
                <p className="font-medium">{t("reports.reconciliation")}</p>
                <p className="mt-1">
                  {formatValue(report.summary.startValueUsd)} + {getSignedCurrency(report.summary.capitalNetFlowUsd)} +{" "}
                  {getSignedCurrency(report.summary.pnlUsd)} = {formatValue(reconciledEnd)}
                </p>
                <p className="mt-1 text-xs">
                  {t("reports.reportedEnd")}: {formatValue(report.summary.endValueUsd)} · {t("reports.gap")}:{" "}
                  {getSignedCurrency(report.summary.reconciliationGapUsd)}
                </p>
              </div>

              {report.dataQuality.notes.length > 0 ? (
                <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
                  <p className="text-sm font-medium text-text-primary">
                    {t("reports.dataQuality")}
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-text-dim">
                    {report.dataQuality.notes.map((note, index) => (
                      <p key={`${note}-${index}`}>{note}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("reports.portfolioValueTimeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              {reportTimeline.length > 1 ? (
                <AccessibleChartFrame
                  title={t("reports.portfolioValueTimeline")}
                  summary={timelineChartSummary}
                >
                  <PortfolioLineChart data={reportTimeline} />
                </AccessibleChartFrame>
              ) : (
                <EmptyState
                  title={t("reports.timelineEmpty")}
                  description={t("reports.timelineEmptyDesc")}
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
        </>
      )}

      {(showActivitySection || showRiskSection) && (
        <div
          className={cn(
            "grid grid-cols-1 gap-6",
            showActivitySection && showRiskSection ? "lg:grid-cols-2" : ""
          )}
        >
          {showActivitySection && (
            <Card>
              <CardHeader>
                <CardTitle>{t("reports.activity")}</CardTitle>
              </CardHeader>
              <CardContent>
                <SummaryStrip
                  items={[
                    {
                      key: "transactions",
                      label: t("reports.transactions"),
                      value: report.activity.transactionCount,
                    },
                    {
                      key: "fees",
                      label: t("reports.totalFees"),
                      value: formatUsd(report.activity.totalFeesUsd),
                    },
                    {
                      key: "estimated",
                      label: t("reports.estimatedAmountTransactions"),
                      value: report.activity.estimatedAmountTransactionCount,
                    },
                    {
                      key: "unknown",
                      label: t("reports.unknownAmountTransactions"),
                      value: report.activity.unknownAmountTransactionCount,
                    },
                    {
                      key: "buy",
                      label: t("reports.buyVolume"),
                      value: formatUsd(report.activity.buyVolumeUsd),
                      tone: "positive",
                    },
                    {
                      key: "sell",
                      label: t("reports.sellVolume"),
                      value: formatUsd(report.activity.sellVolumeUsd),
                      tone: "negative",
                    },
                    {
                      key: "receive",
                      label: t("reports.receiveVolume"),
                      value: formatUsd(report.activity.receiveVolumeUsd),
                    },
                    {
                      key: "send",
                      label: t("reports.sendVolume"),
                      value: formatUsd(report.activity.sendVolumeUsd),
                    },
                  ]}
                  columnsClassName="sm:grid-cols-2"
                  size="compact"
                  className="gap-3"
                />
              </CardContent>
            </Card>
          )}

          {showRiskSection && (
            <Card>
              <CardHeader>
                <CardTitle>{t("reports.riskSnapshot")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SummaryStrip
                  items={[
                    {
                      key: "active-assets",
                      label: t("reports.activeAssets"),
                      value: report.risk.activeAssets,
                    },
                    {
                      key: "top-concentration",
                      label: t("reports.topConcentration"),
                      value: report.risk.topConcentrationSymbol
                        ? `${report.risk.topConcentrationSymbol} ${report.risk.topConcentrationPercent.toFixed(2)}%`
                        : t("reports.notAvailable"),
                    },
                    {
                      key: "herfindahl",
                      label: t("reports.herfindahlIndex"),
                      value: report.risk.herfindahlIndex.toFixed(4),
                    },
                    {
                      key: "diversification",
                      label: t("reports.diversificationScore"),
                      value: report.risk.diversificationScore.toFixed(2),
                    },
                  ]}
                  columnsClassName="sm:grid-cols-2"
                  size="compact"
                  className="gap-3"
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.bestPerformer")}</p>
                    <p className="font-semibold text-status-positive">
                      {report.bestPerformer
                        ? `${report.bestPerformer.symbol} ${getSignedPercent(
                            report.bestPerformer.returnPercent
                          )} (${getSignedCurrency(report.bestPerformer.pnlUsd)})`
                        : t("reports.notAvailable")}
                    </p>
                    {report.bestPerformer ? (
                      <p className="text-xs text-text-dim">
                        {t("reports.held")}: {report.bestPerformer.heldDays}d · {t("reports.pnlPerDay")}:{" "}
                        {getSignedCurrency(report.bestPerformer.pnlPerHeldDayUsd)} · {t("reports.annualized")}:{" "}
                        {getSignedPercent(report.bestPerformer.annualizedReturnPercent)}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.worstPerformer")}</p>
                    <p className="font-semibold text-status-negative">
                      {report.worstPerformer
                        ? `${report.worstPerformer.symbol} ${getSignedPercent(
                            report.worstPerformer.returnPercent
                          )} (${getSignedCurrency(report.worstPerformer.pnlUsd)})`
                        : t("reports.notAvailable")}
                    </p>
                    {report.worstPerformer ? (
                      <p className="text-xs text-text-dim">
                        {t("reports.held")}: {report.worstPerformer.heldDays}d · {t("reports.pnlPerDay")}:{" "}
                        {getSignedCurrency(report.worstPerformer.pnlPerHeldDayUsd)} · {t("reports.annualized")}:{" "}
                        {getSignedPercent(report.worstPerformer.annualizedReturnPercent)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {showHoldingsSection && (
        <Card>
          <CardSectionHeader
            title={t("reports.topHoldings")}
            actions={
              <Link href="/portfolio">
                <Button size="sm" variant="outline">
                  {t("portfolio.title")}
                </Button>
              </Link>
            }
          />
          <CardContent>
            {report.topHoldings.length === 0 ? (
              <EmptyState
                title={t("reports.noActiveHoldings")}
                description={t("reports.noActiveHoldingsDesc")}
                action={
                  <Link href="/portfolio">
                    <Button size="sm" variant="outline">
                      {t("portfolio.title")}
                    </Button>
                  </Link>
                }
                className="py-8"
              />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {report.topHoldings.map((holding) => (
                    <div
                      key={holding.symbol}
                      className="rounded-lg border border-border-subtle bg-bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-text-primary">
                            {holding.symbol}
                          </p>
                          <p className="text-xs text-text-subtle">
                            {t("reports.held")}: {holding.heldDays > 0 ? `${holding.heldDays}d` : "-"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-text-primary">
                            {formatUsd(holding.valueUsd)}
                          </p>
                          <p className="text-xs text-text-subtle">
                            {holding.percent.toFixed(2)}%
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-text-subtle">
                            {t("reports.unrealizedPL")}
                          </p>
                          <p
                            className={cn(
                              holding.unrealizedPLUsd >= 0
                                ? "text-status-positive"
                                : "text-status-negative"
                            )}
                          >
                            {getSignedCurrency(holding.unrealizedPLUsd)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-subtle">
                            {t("reports.return")}
                          </p>
                          <p
                            className={cn(
                              holding.unrealizedPLPercent >= 0
                                ? "text-status-positive"
                                : "text-status-negative"
                            )}
                          >
                            {getSignedPercent(holding.unrealizedPLPercent)}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-text-subtle">
                            {t("reports.unrealizedPLPerDay")}
                          </p>
                          <p
                            className={cn(
                              holding.unrealizedPnlPerHeldDayUsd >= 0
                                ? "text-status-positive"
                                : "text-status-negative"
                            )}
                          >
                            {getSignedCurrency(holding.unrealizedPnlPerHeldDayUsd)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-left text-sm">
                    <caption className="sr-only">{t("reports.topHoldings")}</caption>
                    <thead>
                      <tr className="border-b border-border-subtle text-text-subtle">
                        <th scope="col" className="px-2 py-2 font-medium">{t("reports.token")}</th>
                        <th scope="col" className="px-2 py-2 font-medium">{t("reports.value")}</th>
                        <th scope="col" className="px-2 py-2 font-medium">{t("reports.weight")}</th>
                        <th scope="col" className="px-2 py-2 font-medium">{t("reports.held")}</th>
                        <th scope="col" className="px-2 py-2 font-medium">{t("reports.unrealizedPL")}</th>
                        <th scope="col" className="px-2 py-2 font-medium">{t("reports.unrealizedPLPerDay")}</th>
                        <th scope="col" className="px-2 py-2 font-medium">{t("reports.return")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topHoldings.map((holding) => (
                        <tr
                          key={holding.symbol}
                          className="border-b border-border-subtle/60 text-text-primary"
                        >
                          <th scope="row" className="px-2 py-2 text-left font-medium">{holding.symbol}</th>
                          <td className="px-2 py-2">{formatUsd(holding.valueUsd)}</td>
                          <td className="px-2 py-2">{holding.percent.toFixed(2)}%</td>
                          <td className="px-2 py-2">{holding.heldDays > 0 ? `${holding.heldDays}d` : "-"}</td>
                          <td
                            className={cn(
                              "px-2 py-2",
                              holding.unrealizedPLUsd >= 0
                                ? "text-status-positive"
                                : "text-status-negative"
                            )}
                          >
                            {getSignedCurrency(holding.unrealizedPLUsd)}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-2",
                              holding.unrealizedPnlPerHeldDayUsd >= 0
                                ? "text-status-positive"
                                : "text-status-negative"
                            )}
                          >
                            {getSignedCurrency(holding.unrealizedPnlPerHeldDayUsd)}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-2",
                              holding.unrealizedPLPercent >= 0
                                ? "text-status-positive"
                                : "text-status-negative"
                            )}
                          >
                            {getSignedPercent(holding.unrealizedPLPercent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
      </SectionPanel>
    </div>
  );
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
