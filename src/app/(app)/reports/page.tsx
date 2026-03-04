"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PortfolioLineChart } from "@/components/charts/portfolio-line";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { useVaultStore } from "@/lib/store";
import { usePortfolio } from "@/hooks/use-portfolio";
import {
  type PortfolioPeriodReport,
  type ReportPeriod,
  computePortfolioReport,
} from "@/lib/services/reporting";
import { formatUsd } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import Link from "next/link";
import { BookOpen, Download } from "lucide-react";

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "weekly", label: "Week" },
  { value: "monthly", label: "Month" },
  { value: "quarterly", label: "Quarter" },
  { value: "yearly", label: "Year" },
];

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

function toCsv(report: PortfolioPeriodReport): string {
  const rows: string[][] = [
    ["Report Label", report.window.label],
    ["Generated At", report.generatedAt],
    ["Window Start", report.window.startIso],
    ["Window End", report.window.endIso],
    ["Start Value USD", String(report.summary.startValueUsd)],
    ["End Value USD", String(report.summary.endValueUsd)],
    ["Net Flow USD", String(report.summary.netFlowUsd)],
    ["PnL USD", String(report.summary.pnlUsd)],
    ["Return Percent", String(report.summary.returnPercent)],
    ["Max Drawdown Percent", String(report.summary.maxDrawdownPercent)],
    [
      "Annualized Volatility Percent",
      String(report.summary.annualizedVolatilityPercent),
    ],
    ["Transactions", String(report.activity.transactionCount)],
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
    "Unrealized PnL USD",
    "Unrealized PnL Percent",
  ]);

  for (const row of report.topHoldings) {
    rows.push([
      row.symbol,
      String(row.valueUsd),
      String(row.percent),
      String(row.unrealizedPLUsd),
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
  const { format: formatValue } = useCurrency();
  const vault = useVaultStore((s) => s.vault);
  const { holdings, totals, isLoading } = usePortfolio();

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

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Reports</h1>
          <p className="text-text-subtle">
            Weekly, monthly, quarterly, yearly performance and risk.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            Export JSON
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
            Export CSV
          </Button>
          <Link href="/guide#reports">
            <Button variant="outline" size="sm">
              <BookOpen className="mr-2 h-4 w-4" />
              Usage Guide
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setPeriod(option.value)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              period === option.value
                ? "border-border-subtle bg-bg-hover text-text-primary"
                : "border-border-subtle bg-bg-card text-text-subtle hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{report.window.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-xs text-text-subtle">Start Value</p>
              <p className="text-lg font-semibold">
                {formatValue(report.summary.startValueUsd)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-subtle">End Value</p>
              <p className="text-lg font-semibold">
                {formatValue(report.summary.endValueUsd)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-subtle">Net Flow</p>
              <p className="text-lg font-semibold">
                {getSignedCurrency(report.summary.netFlowUsd)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-subtle">Period P&L</p>
              <p
                className={`text-lg font-semibold ${
                  report.summary.pnlUsd >= 0
                    ? "text-status-positive"
                    : "text-status-negative"
                }`}
              >
                {getSignedCurrency(report.summary.pnlUsd)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-subtle">Return</p>
              <p
                className={`text-lg font-semibold ${
                  report.summary.returnPercent >= 0
                    ? "text-status-positive"
                    : "text-status-negative"
                }`}
              >
                {getSignedPercent(report.summary.returnPercent)}
              </p>
              <p className="text-xs text-text-dim">
                vs prev: {getSignedPercent(returnDelta)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-subtle">Max Drawdown</p>
              <p className="text-lg font-semibold text-status-negative">
                -{report.summary.maxDrawdownPercent.toFixed(2)}%
              </p>
              <p className="text-xs text-text-dim">
                Vol: {report.summary.annualizedVolatilityPercent.toFixed(2)}%
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-text-dim">
            Previous period P&L delta: {getSignedCurrency(pnlDelta)}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Transactions</p>
                <p className="text-lg font-semibold text-text-primary">
                  {report.activity.transactionCount}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Total Fees</p>
                <p className="text-lg font-semibold text-text-primary">
                  {formatUsd(report.activity.totalFeesUsd)}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Buy Volume</p>
                <p className="font-semibold text-status-positive">
                  {formatUsd(report.activity.buyVolumeUsd)}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Sell Volume</p>
                <p className="font-semibold text-status-negative">
                  {formatUsd(report.activity.sellVolumeUsd)}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Receive Volume</p>
                <p className="font-semibold text-text-primary">
                  {formatUsd(report.activity.receiveVolumeUsd)}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Send Volume</p>
                <p className="font-semibold text-text-primary">
                  {formatUsd(report.activity.sendVolumeUsd)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Active Assets</p>
                <p className="text-lg font-semibold text-text-primary">
                  {report.risk.activeAssets}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Top Concentration</p>
                <p className="text-lg font-semibold text-text-primary">
                  {report.risk.topConcentrationSymbol
                    ? `${report.risk.topConcentrationSymbol} ${report.risk.topConcentrationPercent.toFixed(
                        2
                      )}%`
                    : "N/A"}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Herfindahl Index</p>
                <p className="font-semibold text-text-primary">
                  {report.risk.herfindahlIndex.toFixed(4)}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Diversification Score</p>
                <p className="font-semibold text-text-primary">
                  {report.risk.diversificationScore.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Best Performer</p>
                <p className="font-semibold text-status-positive">
                  {report.bestPerformer
                    ? `${report.bestPerformer.symbol} ${getSignedPercent(
                        report.bestPerformer.returnPercent
                      )}`
                    : "N/A"}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-card px-3 py-2">
                <p className="text-text-subtle">Worst Performer</p>
                <p className="font-semibold text-status-negative">
                  {report.worstPerformer
                    ? `${report.worstPerformer.symbol} ${getSignedPercent(
                        report.worstPerformer.returnPercent
                      )}`
                    : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio Value Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {reportTimeline.length > 1 ? (
            <PortfolioLineChart data={reportTimeline} />
          ) : (
            <p className="py-8 text-center text-text-subtle">
              Not enough snapshots in this period yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          {report.topHoldings.length === 0 ? (
            <p className="text-text-subtle">No active holdings.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-text-subtle">
                    <th className="px-2 py-2 font-medium">Token</th>
                    <th className="px-2 py-2 font-medium">Value</th>
                    <th className="px-2 py-2 font-medium">Weight</th>
                    <th className="px-2 py-2 font-medium">Unrealized P&L</th>
                    <th className="px-2 py-2 font-medium">Return</th>
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
                      <td
                        className={`px-2 py-2 ${
                          holding.unrealizedPLUsd >= 0
                            ? "text-status-positive"
                            : "text-status-negative"
                        }`}
                      >
                        {getSignedCurrency(holding.unrealizedPLUsd)}
                      </td>
                      <td
                        className={`px-2 py-2 ${
                          holding.unrealizedPLPercent >= 0
                            ? "text-status-positive"
                            : "text-status-negative"
                        }`}
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
    </div>
  );
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
