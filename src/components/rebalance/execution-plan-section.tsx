"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import { getActionBadge } from "@/components/rebalance/helpers";
import type { ExecutionStep } from "@/components/rebalance/types";
import { Play } from "lucide-react";

interface ExecutionPlanSectionProps {
  steps: ExecutionStep[];
}

export function ExecutionPlanSection({ steps }: ExecutionPlanSectionProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          {t("rebalance.executionPlan")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-text-subtle">
          {t("rebalance.executionPlanDescription")}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("rebalance.executionPlan")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-text-subtle">
                <th scope="col" className="pb-3 pr-4">{t("rebalance.step")}</th>
                <th scope="col" className="pb-3 pr-4">{t("rebalance.action")}</th>
                <th scope="col" className="pb-3 pr-4">{t("rebalance.token")}</th>
                <th scope="col" className="pb-3 pr-4 text-right">{t("rebalance.amount")}</th>
                <th scope="col" className="pb-3 pr-4 text-right">{t("rebalance.feesSlip")}</th>
                <th scope="col" className="pb-3 text-right">{t("rebalance.cashAfter")}</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr key={step.step} className="border-b border-border-subtle">
                  <th scope="row" className="py-3 pr-4 text-left text-text-subtle">
                    #{step.step}
                  </th>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${getActionBadge(step.action)}`}
                    >
                      {step.action}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-medium text-text-primary">
                    {step.tokenSymbol}
                  </td>
                  <td className="py-3 pr-4 text-right">{formatUsd(step.amount)}</td>
                  <td className="py-3 pr-4 text-right text-text-subtle">
                    {formatUsd(step.estimatedSlippage + step.estimatedFee)}
                  </td>
                  <td
                    className={`py-3 text-right font-medium ${
                      step.runningCashAfter >= 0
                        ? "text-status-positive"
                        : "text-status-negative"
                    }`}
                  >
                    {formatUsd(step.runningCashAfter)}
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
