"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBanner } from "@/components/ui/status-banner";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import type { RebalanceSummary } from "@/components/rebalance/types";
import { Activity, CheckCircle2, ShieldAlert } from "lucide-react";

interface SummarySectionProps {
  summary: RebalanceSummary;
  hasConcentrationRisk: boolean;
  concentrationThresholdLabel: string;
  hasTargetedSuggestions: boolean;
}

export function SummarySection({
  summary,
  hasConcentrationRisk,
  concentrationThresholdLabel,
  hasTargetedSuggestions,
}: SummarySectionProps) {
  const { t } = useTranslation();

  if (summary.isWellBalanced) {
    return (
      <StatusBanner
        tone={hasConcentrationRisk ? "warning" : "success"}
        heading={
          hasConcentrationRisk
            ? t("rebalance.onTargetButConcentration")
            : t("rebalance.wellBalanced")
        }
        icon={
          hasConcentrationRisk ? (
            <ShieldAlert className="h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )
        }
        contentClassName="space-y-0"
      >
        <p className="text-sm text-text-subtle">
          {hasConcentrationRisk
            ? t("rebalance.concentrationThresholdExceeded", {
                threshold: concentrationThresholdLabel,
              })
            : t("rebalance.portfolioDriftBelow", {
                drift: summary.portfolioDrift.toFixed(1),
                threshold: summary.driftThresholdPercent,
              })}
        </p>
      </StatusBanner>
    );
  }

  if (!hasTargetedSuggestions) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          {t("rebalance.summary")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          <div className="rounded-md bg-bg-card px-3 py-2 text-center">
            <p className="text-xs text-text-subtle">{t("rebalance.totalTrades")}</p>
            <p className="text-lg font-bold text-text-primary">{summary.tradeCount}</p>
            <p className="text-xs text-text-dim">
              {summary.sellCount} {t("rebalance.sells")}, {summary.buyCount} {t("rebalance.buys")}
            </p>
          </div>
          <div className="rounded-md bg-bg-card px-3 py-2 text-center">
            <p className="text-xs text-text-subtle">{t("rebalance.totalVolume")}</p>
            <p className="text-lg font-bold text-text-primary">
              {formatUsd(summary.totalVolume)}
            </p>
          </div>
          <div className="rounded-md bg-bg-card px-3 py-2 text-center">
            <p className="text-xs text-text-subtle">{t("rebalance.estFees")}</p>
            <p className="text-lg font-bold text-text-primary">
              {formatUsd(summary.totalEstimatedFees)}
            </p>
          </div>
          <div className="rounded-md bg-bg-card px-3 py-2 text-center">
            <p className="text-xs text-text-subtle">{t("rebalance.portfolioDrift")}</p>
            <p
              className={`text-lg font-bold ${
                summary.portfolioDrift < 5
                  ? "text-status-positive"
                  : summary.portfolioDrift < 10
                    ? "text-status-warning"
                    : "text-status-negative"
              }`}
            >
              {summary.portfolioDrift.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-md bg-bg-card px-3 py-2 text-center">
            <p className="text-xs text-text-subtle">{t("rebalance.efficiency")}</p>
            <p
              className={`text-lg font-bold ${
                summary.portfolioEfficiency >= 95
                  ? "text-status-positive"
                  : summary.portfolioEfficiency >= 90
                    ? "text-status-warning"
                    : "text-status-negative"
              }`}
            >
              {summary.portfolioEfficiency.toFixed(1)}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
