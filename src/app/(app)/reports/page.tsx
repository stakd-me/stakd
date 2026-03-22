"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PortfolioLineChart } from "@/components/charts/portfolio-line";
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

function getDataQualityClass(level: PortfolioPeriodReport["dataQuality"]["level"]): string {
  if (level === "exact") {
    return "border-status-positive-border bg-status-positive-soft text-status-positive";
  }
  if (level === "estimated") {
    return "border-status-caution-border bg-status-caution-soft text-status-caution";
  }
  return "border-status-negative-border bg-status-negative-soft text-status-negative";
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
          <Link href="/guide#reports">
            <Button variant="outline" size="sm">
              <BookOpen className="mr-2 h-4 w-4" />
              {t("reports.usageGuide")}
            </Button>
          </Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPeriod(option)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
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

      <Card className="p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t("reports.focusView")}
            </p>
            <p className="text-xs text-text-dim">
              {report.window.label}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
            {sectionOptions.map((section) => (
              <button
                key={section.value}
                type="button"
                onClick={() => setActiveSection(section.value)}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  activeSection === section.value
                    ? "border-accent bg-accent/10 text-text-primary"
                    : "border-border-subtle bg-bg-card text-text-subtle hover:bg-bg-hover hover:text-text-primary"
                )}
                aria-pressed={activeSection === section.value}
              >
                <span className="min-w-0 truncate font-medium">
                  {section.label}
                </span>
                <span className="ml-3 rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-tertiary">
                  {section.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {showOverviewSection && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>{report.window.label}</CardTitle>
                  <p className="text-sm text-text-subtle">
                    {t("reports.returnModifiedDietz")}, {t("reports.periodPL")}, {t("reports.reconciliation")}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getDataQualityClass(
                    report.dataQuality.level
                  )}`}
                >
                  {t("reports.dataQuality")}: {dataQualityLabels[report.dataQuality.level]}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
                  <p className="text-xs text-text-subtle">{t("reports.endValue")}</p>
                  <p className="mt-2 text-2xl font-bold text-text-primary">
                    {formatValue(report.summary.endValueUsd)}
                  </p>
                  <p className="mt-1 text-xs text-text-dim">
                    {t("reports.startValue")}: {formatValue(report.summary.startValueUsd)}
                  </p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
                  <p className="text-xs text-text-subtle">{t("reports.periodPL")}</p>
                  <p
                    className={cn(
                      "mt-2 text-2xl font-bold",
                      report.summary.pnlUsd >= 0
                        ? "text-status-positive"
                        : "text-status-negative"
                    )}
                  >
                    {getSignedCurrency(report.summary.pnlUsd)}
                  </p>
                  {showPreviousComparison ? (
                    <p className="mt-1 text-xs text-text-dim">
                      {t("reports.previousPnlDelta")}: {getSignedCurrency(pnlDelta)}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
                  <p className="text-xs text-text-subtle">{t("reports.returnModifiedDietz")}</p>
                  <p
                    className={cn(
                      "mt-2 text-2xl font-bold",
                      report.summary.returnPercent >= 0
                        ? "text-status-positive"
                        : "text-status-negative"
                    )}
                  >
                    {getSignedPercent(report.summary.returnPercent)}
                  </p>
                  <p className="mt-1 text-xs text-text-dim">
                    {t("reports.simple")}: {getSignedPercent(report.summary.simpleReturnPercent)}
                  </p>
                  {showPreviousComparison ? (
                    <p className="mt-1 text-xs text-text-dim">
                      {t("reports.deltaVsPreviousToDate")}: {getSignedPercent(returnDelta)}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
                  <p className="text-xs text-text-subtle">{t("reports.maxDrawdown")}</p>
                  <p className="mt-2 text-2xl font-bold text-status-negative">
                    -{report.summary.maxDrawdownPercent.toFixed(2)}%
                  </p>
                  <p className="mt-1 text-xs text-text-dim">
                    {t("reports.volatility")}: {report.summary.annualizedVolatilityPercent.toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
                  <p className="text-xs text-text-subtle">{t("reports.capitalNetFlow")}</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">
                    {getSignedCurrency(report.summary.capitalNetFlowUsd)}
                  </p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
                  <p className="text-xs text-text-subtle">{t("reports.externalNetFlow")}</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">
                    {getSignedCurrency(report.summary.externalNetFlowUsd)}
                  </p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
                  <p className="text-xs text-text-subtle">{t("reports.tradingTurnover")}</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">
                    {formatValue(report.summary.tradingTurnoverUsd)}
                  </p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
                  <p className="text-xs text-text-subtle">{t("reports.totalFees")}</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">
                    {formatUsd(report.activity.totalFeesUsd)}
                  </p>
                </div>
              </div>

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
                <PortfolioLineChart data={reportTimeline} />
              ) : (
                <p className="py-8 text-center text-text-subtle">
                  {t("reports.timelineEmpty")}
                </p>
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.transactions")}</p>
                    <p className="text-lg font-semibold text-text-primary">
                      {report.activity.transactionCount}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.totalFees")}</p>
                    <p className="text-lg font-semibold text-text-primary">
                      {formatUsd(report.activity.totalFeesUsd)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.estimatedAmountTransactions")}</p>
                    <p className="text-lg font-semibold text-text-primary">
                      {report.activity.estimatedAmountTransactionCount}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.unknownAmountTransactions")}</p>
                    <p className="text-lg font-semibold text-text-primary">
                      {report.activity.unknownAmountTransactionCount}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.buyVolume")}</p>
                    <p className="font-semibold text-status-positive">
                      {formatUsd(report.activity.buyVolumeUsd)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.sellVolume")}</p>
                    <p className="font-semibold text-status-negative">
                      {formatUsd(report.activity.sellVolumeUsd)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.receiveVolume")}</p>
                    <p className="font-semibold text-text-primary">
                      {formatUsd(report.activity.receiveVolumeUsd)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.sendVolume")}</p>
                    <p className="font-semibold text-text-primary">
                      {formatUsd(report.activity.sendVolumeUsd)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {showRiskSection && (
            <Card>
              <CardHeader>
                <CardTitle>{t("reports.riskSnapshot")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.activeAssets")}</p>
                    <p className="text-lg font-semibold text-text-primary">
                      {report.risk.activeAssets}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.topConcentration")}</p>
                    <p className="text-lg font-semibold text-text-primary">
                      {report.risk.topConcentrationSymbol
                        ? `${report.risk.topConcentrationSymbol} ${report.risk.topConcentrationPercent.toFixed(2)}%`
                        : t("reports.notAvailable")}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.herfindahlIndex")}</p>
                    <p className="font-semibold text-text-primary">
                      {report.risk.herfindahlIndex.toFixed(4)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                    <p className="text-text-subtle">{t("reports.diversificationScore")}</p>
                    <p className="font-semibold text-text-primary">
                      {report.risk.diversificationScore.toFixed(2)}
                    </p>
                  </div>
                </div>
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
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>{t("reports.topHoldings")}</CardTitle>
              <Link href="/portfolio">
                <Button size="sm" variant="outline">
                  {t("portfolio.title")}
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {report.topHoldings.length === 0 ? (
              <p className="text-text-subtle">{t("reports.noActiveHoldings")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-text-subtle">
                      <th className="px-2 py-2 font-medium">{t("reports.token")}</th>
                      <th className="px-2 py-2 font-medium">{t("reports.value")}</th>
                      <th className="px-2 py-2 font-medium">{t("reports.weight")}</th>
                      <th className="px-2 py-2 font-medium">{t("reports.held")}</th>
                      <th className="px-2 py-2 font-medium">{t("reports.unrealizedPL")}</th>
                      <th className="px-2 py-2 font-medium">{t("reports.unrealizedPLPerDay")}</th>
                      <th className="px-2 py-2 font-medium">{t("reports.return")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topHoldings.map((holding) => (
                      <tr
                        key={holding.symbol}
                        className="border-b border-border-subtle/60 text-text-primary"
                      >
                        <td className="px-2 py-2 font-medium">{holding.symbol}</td>
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
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
