"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useTranslation } from "@/hooks/use-translation";
import { PriceFlash } from "@/components/ui/price-flash";
import { formatUsd } from "@/lib/utils";
import {
  getActionBadge,
  getDeviationBg,
  getDeviationColor,
  getSeverityBadge,
} from "@/components/rebalance/helpers";
import type { Alert, Suggestion } from "@/components/rebalance/types";
import { AlertTriangle, Download, FileText, ShieldAlert } from "lucide-react";
import { usePrivacy } from "@/hooks/use-privacy";

interface CurrentVsTargetSectionProps {
  totalValue: number;
  suggestionsLoading: boolean;
  suggestions: Suggestion[];
  concentrationAlerts: Alert[];
  concentrationThresholdLabel: string;
  severityLabels: Record<Alert["severity"], string>;
  onExportReport: () => void;
  onExportCsv: () => void;
  formatSuggestionTradeQuantity: (suggestion: Suggestion) => string;
}

export function CurrentVsTargetSection({
  totalValue,
  suggestionsLoading,
  suggestions,
  concentrationAlerts,
  concentrationThresholdLabel,
  severityLabels,
  onExportReport,
  onExportCsv,
  formatSuggestionTradeQuantity,
}: CurrentVsTargetSectionProps) {
  const { mask } = usePrivacy();
  const { t } = useTranslation();

  // Build concentration lookup by symbol
  const concentrationBySymbol = new Map(
    concentrationAlerts.map((a) => [a.tokenSymbol, a])
  );

  const hasConcentrationAlerts = concentrationAlerts.length > 0;

  const columns: DataTableColumn<Suggestion>[] = [
    {
      key: "token",
      header: t("rebalance.token"),
      align: "left",
      mobile: "identity",
      cell: (suggestion) => {
        const concAlert = concentrationBySymbol.get(suggestion.tokenSymbol);
        return (
          <span className="flex items-center gap-2">
            {suggestion.tokenSymbol}
            {concAlert && (
              <span
                className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none ${getSeverityBadge(concAlert.severity)}`}
                title={`${t("rebalance.concentrationRisk")}: ${concAlert.currentPercent.toFixed(1)}%`}
              >
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                {severityLabels[concAlert.severity]}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "target",
      header: t("rebalance.targetPercent"),
      mobile: "meta",
      cell: (suggestion) => `${suggestion.targetPercent.toFixed(1)}%`,
    },
    {
      key: "current",
      header: t("rebalance.currentPercent"),
      mobile: "meta",
      cell: (suggestion) => `${suggestion.currentPercent.toFixed(1)}%`,
    },
    {
      key: "deviation",
      header: t("rebalance.deviation"),
      mobile: "meta",
      cell: (suggestion) => (
        <span className={`font-medium ${getDeviationColor(suggestion.deviation)}`}>
          {suggestion.deviation >= 0 ? "+" : ""}
          {suggestion.deviation.toFixed(1)}%
        </span>
      ),
    },
    {
      key: "value",
      header: t("rebalance.currentValue"),
      mobile: "hidden",
      cell: (suggestion) => (
        <PriceFlash value={suggestion.currentValue}>
          {mask(formatUsd(suggestion.currentValue))}
        </PriceFlash>
      ),
    },
    {
      key: "action",
      header: t("rebalance.action"),
      align: "left",
      mobile: "note",
      cell: (suggestion) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span
            className={`inline-block rounded-sm border px-2 py-0.5 text-caption font-semibold uppercase ${getActionBadge(suggestion.action)}`}
          >
            {t(`rebalance.action.${suggestion.action}`)}
          </span>
          <span className="font-mono tabular md:hidden">
            {mask(formatSuggestionTradeQuantity(suggestion))}
          </span>
        </span>
      ),
    },
    {
      key: "quantity",
      header: t("rebalance.quantity"),
      mobile: "hidden",
      cell: (suggestion) => mask(formatSuggestionTradeQuantity(suggestion)),
    },
    {
      key: "amount",
      header: t("rebalance.amount"),
      mobile: "primary",
      cell: (suggestion) =>
        suggestion.action !== "hold" ? (
          <>
            {mask(formatUsd(suggestion.amount))}
            {suggestion.estimatedSlippage > 0 || suggestion.estimatedFee > 0 ? (
              <span className="mt-0.5 block text-caption text-text-muted">
                {t("rebalance.fees")}: {mask(formatUsd(suggestion.estimatedFee))} | {t("rebalance.slip")}:{" "}
                {mask(formatUsd(suggestion.estimatedSlippage))}
              </span>
            ) : null}
          </>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>{t("rebalance.currentVsTarget")}</CardTitle>
            {hasConcentrationAlerts && (
              <span className="flex items-center gap-1.5 rounded-sm border border-status-negative-border bg-status-negative-soft px-2.5 py-0.5 text-caption font-semibold text-status-negative">
                <ShieldAlert className="h-3 w-3" />
                {t("rebalance.concentrationRisk")} ({concentrationThresholdLabel}%)
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onExportReport}>
              <FileText className="mr-2 h-4 w-4" />
              {t("rebalance.exportReport")}
            </Button>
            <Button variant="outline" size="sm" onClick={onExportCsv}>
              <Download className="mr-2 h-4 w-4" />
              {t("rebalance.exportCsv")}
            </Button>
            <span className="text-body text-text-muted">
              {t("rebalance.totalPortfolio")}: {mask(formatUsd(totalValue))}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {suggestionsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <DataTable
            caption={t("rebalance.currentVsTarget")}
            columns={columns}
            rows={suggestions}
            rowKey={(suggestion) => suggestion.tokenSymbol}
            rowClassName={(suggestion) => getDeviationBg(suggestion.deviation)}
          />
        )}
      </CardContent>
    </Card>
  );
}
