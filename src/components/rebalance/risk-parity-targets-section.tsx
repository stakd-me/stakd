"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useTranslation } from "@/hooks/use-translation";
import type { SuggestionsData } from "@/components/rebalance/types";

type Target = NonNullable<SuggestionsData["riskParityTargets"]>[number];

interface RiskParityTargetsSectionProps {
  targets: NonNullable<SuggestionsData["riskParityTargets"]>;
  usesFallback: boolean;
}

export function RiskParityTargetsSection({
  targets,
  usesFallback,
}: RiskParityTargetsSectionProps) {
  const { t } = useTranslation();

  const columns: DataTableColumn<Target>[] = [
    {
      key: "token",
      header: t("rebalance.token"),
      align: "left",
      mobile: "identity",
      cell: (target) => target.tokenSymbol,
    },
    {
      key: "volatility",
      header: t("rebalance.volatility"),
      mobile: "meta",
      cell: (target) =>
        target.hasVolatilityData
          ? `${target.volatility.toFixed(1)}%`
          : t("rebalance.volatilityUnavailable"),
    },
    {
      key: "target",
      header: t("rebalance.computedTarget"),
      mobile: "primary",
      className: "text-text-primary",
      cell: (target) => `${target.computedTargetPercent.toFixed(1)}%`,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("rebalance.riskParityTargets")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-body text-text-muted">
          {t("rebalance.riskParityDescription")}
        </p>
        {usesFallback ? (
          <p className="mb-3 border border-status-warning-border bg-status-warning-soft px-3 py-2 text-caption text-status-warning">
            {t("rebalance.riskParityFallback")}
          </p>
        ) : null}

        <DataTable
          caption={t("rebalance.riskParityTargets")}
          columns={columns}
          rows={targets}
          rowKey={(target) => target.tokenSymbol}
        />
      </CardContent>
    </Card>
  );
}
