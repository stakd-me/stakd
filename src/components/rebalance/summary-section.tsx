"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBanner } from "@/components/ui/status-banner";
import { Metric, MetricBand } from "@/components/ui/metric";
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
        <p className="text-body text-text-muted">
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
    <Card className="p-0">
      <CardHeader className="mb-0 border-b border-border px-5 py-3">
        <CardTitle className="flex items-center gap-2 text-label uppercase">
          <Activity className="h-4 w-4" aria-hidden="true" />
          {t("rebalance.summary")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MetricBand columns={5} className="border-0">
          <Metric
            size="md"
            label={t("rebalance.totalTrades")}
            value={summary.tradeCount}
            sub={`${summary.sellCount} ${t("rebalance.sells")}, ${summary.buyCount} ${t("rebalance.buys")}`}
          />
          <Metric
            size="md"
            label={t("rebalance.totalVolume")}
            value={formatUsd(summary.totalVolume)}
          />
          <Metric
            size="md"
            label={t("rebalance.estFees")}
            value={formatUsd(summary.totalEstimatedFees)}
          />
          <Metric
            size="md"
            label={t("rebalance.portfolioDrift")}
            value={`${summary.portfolioDrift.toFixed(1)}%`}
            tone={
              summary.portfolioDrift < 5
                ? "positive"
                : summary.portfolioDrift < 10
                  ? "warning"
                  : "negative"
            }
          />
          <Metric
            size="md"
            label={t("rebalance.efficiency")}
            value={`${summary.portfolioEfficiency.toFixed(1)}%`}
            tone={
              summary.portfolioEfficiency >= 95
                ? "positive"
                : summary.portfolioEfficiency >= 90
                  ? "warning"
                  : "negative"
            }
          />
        </MetricBand>
      </CardContent>
    </Card>
  );
}
