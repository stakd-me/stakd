"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  const { t } = useTranslation();

  // Build concentration lookup by symbol
  const concentrationBySymbol = new Map(
    concentrationAlerts.map((a) => [a.tokenSymbol, a])
  );

  const hasConcentrationAlerts = concentrationAlerts.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>{t("rebalance.currentVsTarget")}</CardTitle>
            {hasConcentrationAlerts && (
              <span className="flex items-center gap-1.5 rounded-full border border-status-negative-border bg-status-negative-soft px-2.5 py-0.5 text-xs font-medium text-status-negative">
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
            <span className="text-sm text-text-subtle">
              {t("rebalance.totalPortfolio")}: {formatUsd(totalValue)}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("rebalance.currentVsTarget")}</caption>
              <thead>
                <tr className="border-b border-border text-left text-text-subtle">
                  <th scope="col" className="pb-3 pr-4">{t("rebalance.token")}</th>
                  <th scope="col" className="pb-3 pr-4 text-right">{t("rebalance.targetPercent")}</th>
                  <th scope="col" className="pb-3 pr-4 text-right">{t("rebalance.currentPercent")}</th>
                  <th scope="col" className="pb-3 pr-4 text-right">{t("rebalance.deviation")}</th>
                  <th scope="col" className="pb-3 pr-4 text-right">{t("rebalance.currentValue")}</th>
                  <th scope="col" className="pb-3 pr-4 text-center">{t("rebalance.action")}</th>
                  <th scope="col" className="pb-3 pr-4 text-right">{t("rebalance.quantity")}</th>
                  <th scope="col" className="pb-3 text-right">{t("rebalance.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((suggestion) => {
                  const concAlert = concentrationBySymbol.get(suggestion.tokenSymbol);
                  return (
                    <tr
                      key={suggestion.tokenSymbol}
                      className={`border-b border-border-subtle ${getDeviationBg(suggestion.deviation)}`}
                    >
                      <th scope="row" className="py-3 pr-4 text-left font-medium text-text-primary">
                        <div className="flex items-center gap-2">
                          {suggestion.tokenSymbol}
                          {concAlert && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none ${getSeverityBadge(concAlert.severity)}`}
                              title={`${t("rebalance.concentrationRisk")}: ${concAlert.currentPercent.toFixed(1)}%`}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {severityLabels[concAlert.severity]}
                            </span>
                          )}
                        </div>
                      </th>
                      <td className="py-3 pr-4 text-right">
                        {suggestion.targetPercent.toFixed(1)}%
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {suggestion.currentPercent.toFixed(1)}%
                      </td>
                      <td className={`py-3 pr-4 text-right font-medium ${getDeviationColor(suggestion.deviation)}`}>
                        {suggestion.deviation >= 0 ? "+" : ""}
                        {suggestion.deviation.toFixed(1)}%
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <PriceFlash value={suggestion.currentValue}>{formatUsd(suggestion.currentValue)}</PriceFlash>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${getActionBadge(suggestion.action)}`}
                        >
                          {suggestion.action}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {formatSuggestionTradeQuantity(suggestion)}
                      </td>
                      <td className="py-3 text-right">
                        {suggestion.action !== "hold" ? formatUsd(suggestion.amount) : "-"}
                        {suggestion.action !== "hold" &&
                        (suggestion.estimatedSlippage > 0 || suggestion.estimatedFee > 0) ? (
                          <div className="mt-0.5 text-xs text-text-dim">
                            {t("rebalance.fees")}: {formatUsd(suggestion.estimatedFee)} | {t("rebalance.slip")}: {formatUsd(suggestion.estimatedSlippage)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
