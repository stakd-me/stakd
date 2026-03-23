"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useTranslation } from "@/hooks/use-translation";
import {
  getAlertTypeLabel,
  getDeviationColor,
  getSeverityBadge,
} from "@/components/rebalance/helpers";
import type { Alert } from "@/components/rebalance/types";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

interface AlertsSectionProps {
  alertsError: boolean;
  concentrationAlerts: Alert[];
  deviationAlerts: Alert[];
  concentrationThresholdLabel: string;
  severityLabels: Record<Alert["severity"], string>;
}

export function AlertsSection({
  alertsError,
  concentrationAlerts,
  deviationAlerts,
  concentrationThresholdLabel,
  severityLabels,
}: AlertsSectionProps) {
  const { t } = useTranslation();

  if (concentrationAlerts.length === 0 && deviationAlerts.length === 0) {
    return (
      <EmptyState
        title={t("rebalance.wellBalanced")}
        description={t("rebalance.noAlertsDesc")}
        icon={<CheckCircle2 className="h-5 w-5" />}
        className="py-10"
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-status-warning" />
          {t("rebalance.alerts")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alertsError ? (
          <ErrorState
            title={t("error.failedToLoad")}
            message={t("rebalance.failedLoadAlerts")}
            onRetry={() => {}}
            actionLabel={t("common.tryAgain")}
          />
        ) : (
          <div className="space-y-2">
            {concentrationAlerts.length > 0 ? (
              <div className="mb-4">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-status-negative">
                  <ShieldAlert className="h-4 w-4" />
                  {t("rebalance.concentrationRisk")} ({concentrationThresholdLabel}%)
                </h4>
                {concentrationAlerts.map((alert, index) => (
                  <div
                    key={`conc-${index}`}
                    className="mb-2 flex items-center justify-between rounded-md bg-status-negative-soft px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-block rounded-full border border-status-negative-border bg-status-negative-soft px-2 py-0.5 text-xs font-medium uppercase text-status-negative">
                        {severityLabels[alert.severity]}
                      </span>
                      <span className="font-medium text-text-primary">
                        {alert.tokenSymbol}
                      </span>
                      <span className="text-xs text-text-subtle">
                        ({getAlertTypeLabel(alert.type)})
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-status-negative">
                        {alert.currentPercent.toFixed(1)}% {t("rebalance.ofPortfolio")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {deviationAlerts.length > 0 ? (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-status-warning">
                  {t("rebalance.deviationAlerts")}
                </h4>
                {deviationAlerts.map((alert) => (
                  <div
                    key={alert.tokenSymbol}
                    className="mb-2 flex items-center justify-between rounded-md bg-bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${getSeverityBadge(alert.severity)}`}
                      >
                        {severityLabels[alert.severity]}
                      </span>
                      <span className="font-medium text-text-primary">
                        {alert.tokenSymbol}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-text-subtle">
                        {t("rebalance.targetLabel")}: {alert.targetPercent.toFixed(1)}%
                      </span>
                      <span className="text-text-subtle">
                        {t("rebalance.currentLabel")}: {alert.currentPercent.toFixed(1)}%
                      </span>
                      <span className={`font-medium ${getDeviationColor(alert.deviation)}`}>
                        {alert.deviation >= 0 ? "+" : ""}
                        {alert.deviation.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
