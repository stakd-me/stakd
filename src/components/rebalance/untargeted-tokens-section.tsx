"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { Suggestion } from "@/components/rebalance/types";

interface UntargetedTokensSectionProps {
  suggestions: Suggestion[];
  isTargeted: (tokenSymbol: string) => boolean;
  onAddTarget: (suggestion: Suggestion) => void;
}

export function UntargetedTokensSection({
  suggestions,
  isTargeted,
  onAddTarget,
}: UntargetedTokensSectionProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-text-muted">
          {t("rebalance.untargetedTokens")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-text-subtle">
          {t("rebalance.untargetedDescription")}
        </p>

        <div className="space-y-3 md:hidden">
          {suggestions.map((suggestion) => {
            const alreadyTargeted = isTargeted(suggestion.tokenSymbol);

            return (
              <div
                key={suggestion.tokenSymbol}
                className="rounded-lg border border-border-subtle bg-bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-text-primary">
                      {suggestion.tokenSymbol}
                    </p>
                    <span className="mt-1 inline-flex rounded bg-bg-muted px-1.5 py-0.5 text-xs text-text-subtle">
                      {t("rebalance.untargeted")}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAddTarget(suggestion)}
                    disabled={alreadyTargeted}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("rebalance.addTarget")}
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-text-subtle">
                      {t("rebalance.currentPercent")}
                    </p>
                    <p className="text-text-primary">
                      {suggestion.currentPercent.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-subtle">
                      {t("rebalance.currentValue")}
                    </p>
                    <p className="text-text-primary">
                      {formatUsd(suggestion.currentValue)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("rebalance.untargetedTokens")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-text-subtle">
                <th scope="col" className="pb-3 pr-4">
                  {t("rebalance.token")}
                </th>
                <th scope="col" className="pb-3 pr-4 text-right">
                  {t("rebalance.currentPercent")}
                </th>
                <th scope="col" className="pb-3 pr-4 text-right">
                  {t("rebalance.currentValue")}
                </th>
                <th scope="col" className="pb-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((suggestion) => (
                <tr
                  key={suggestion.tokenSymbol}
                  className="border-b border-border-subtle"
                >
                  <th scope="row" className="py-3 pr-4 text-left font-medium text-text-muted">
                    {suggestion.tokenSymbol}
                    <span className="ml-2 rounded bg-bg-muted px-1.5 py-0.5 text-xs text-text-subtle">
                      {t("rebalance.untargeted")}
                    </span>
                  </th>
                  <td className="py-3 pr-4 text-right text-text-muted">
                    {suggestion.currentPercent.toFixed(1)}%
                  </td>
                  <td className="py-3 pr-4 text-right text-text-muted">
                    {formatUsd(suggestion.currentValue)}
                  </td>
                  <td className="py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAddTarget(suggestion)}
                      disabled={isTargeted(suggestion.tokenSymbol)}
                      className="text-xs"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {t("rebalance.addTarget")}
                    </Button>
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
