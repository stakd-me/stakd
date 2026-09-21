"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import type { ExecutionStep } from "@/components/rebalance/types";
import { Play } from "lucide-react";

interface ExecutionPlanSectionProps {
  steps: ExecutionStep[];
}

function actionTone(action: string) {
  const value = action.toLowerCase();
  if (value.includes("buy")) return "success" as const;
  if (value.includes("sell")) return "danger" as const;
  return "neutral" as const;
}

export function ExecutionPlanSection({ steps }: ExecutionPlanSectionProps) {
  const { t } = useTranslation();

  // This is the list a person works through while placing orders, often on
  // a phone, so it gets the card form below md rather than a sideways drag.
  const columns: DataTableColumn<ExecutionStep>[] = [
    {
      key: "token",
      header: t("rebalance.token"),
      align: "left",
      mobile: "identity",
      cell: (step) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-num-sm text-text-muted">#{step.step}</span>
          {step.tokenSymbol}
        </span>
      ),
    },
    {
      key: "action",
      header: t("rebalance.action"),
      align: "left",
      mobile: "meta",
      cell: (step) => (
        <StatusPill tone={actionTone(step.action)}>{step.action}</StatusPill>
      ),
    },
    {
      key: "amount",
      header: t("rebalance.amount"),
      mobile: "primary",
      cell: (step) => formatUsd(step.amount),
    },
    {
      key: "fees",
      header: t("rebalance.feesSlip"),
      mobile: "meta",
      className: "text-text-muted",
      cell: (step) => formatUsd(step.estimatedSlippage + step.estimatedFee),
    },
    {
      key: "cash",
      header: t("rebalance.cashAfter"),
      mobile: "meta",
      className:
        "font-medium",
      cell: (step) => (
        <span
          className={
            step.runningCashAfter >= 0
              ? "text-status-positive"
              : "text-status-negative"
          }
        >
          {formatUsd(step.runningCashAfter)}
        </span>
      ),
    },
  ];

  return (
    <Card className="p-0">
      <CardHeader className="mb-0 border-b border-border px-5 py-3">
        <CardTitle className="flex items-center gap-2 text-label uppercase">
          <Play className="h-4 w-4" aria-hidden="true" />
          {t("rebalance.executionPlan")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <p className="px-5 pb-3 text-body text-text-secondary">
          {t("rebalance.executionPlanDescription")}
        </p>
        <DataTable
          caption={t("rebalance.executionPlan")}
          columns={columns}
          rows={steps}
          rowKey={(step) => String(step.step)}
        />
      </CardContent>
    </Card>
  );
}
