"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
import type { SuggestionsData } from "@/components/rebalance/types";

interface RiskParityTargetsSectionProps {
  targets: NonNullable<SuggestionsData["riskParityTargets"]>;
  usesFallback: boolean;
}

export function RiskParityTargetsSection({
  targets,
  usesFallback,
}: RiskParityTargetsSectionProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-status-info">
          {t("rebalance.riskParityTargets")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-text-subtle">
          {t("rebalance.riskParityDescription")}
        </p>
        {usesFallback ? (
          <p className="mb-3 rounded-md border border-status-warning-border bg-status-warning-soft px-3 py-2 text-xs text-status-warning">
            {t("rebalance.riskParityFallback")}
          </p>
        ) : null}

        <div className="space-y-3 md:hidden">
          {targets.map((target) => (
            <div
              key={target.tokenSymbol}
              className="rounded-lg border border-border-subtle bg-bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text-primary">
                    {target.tokenSymbol}
                  </p>
                  <p className="text-xs text-text-subtle">
                    {t("rebalance.volatility")}:{" "}
                    {target.hasVolatilityData
                      ? `${target.volatility.toFixed(1)}%`
                      : t("rebalance.volatilityUnavailable")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-text-subtle">
                    {t("rebalance.computedTarget")}
                  </p>
                  <p className="font-semibold text-status-info">
                    {target.computedTargetPercent.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("rebalance.riskParityTargets")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-text-subtle">
                <th scope="col" className="pb-2 pr-4">
                  {t("rebalance.token")}
                </th>
                <th scope="col" className="pb-2 pr-4 text-right">
                  {t("rebalance.volatility")}
                </th>
                <th scope="col" className="pb-2 text-right">
                  {t("rebalance.computedTarget")}
                </th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.tokenSymbol} className="border-b border-border-subtle">
                  <th scope="row" className="py-2 pr-4 text-left font-medium text-text-primary">
                    {target.tokenSymbol}
                  </th>
                  <td className="py-2 pr-4 text-right text-text-muted">
                    {target.hasVolatilityData
                      ? `${target.volatility.toFixed(1)}%`
                      : t("rebalance.volatilityUnavailable")}
                  </td>
                  <td className="py-2 text-right font-medium text-status-info">
                    {target.computedTargetPercent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
