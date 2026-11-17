"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { Suggestion } from "@/components/rebalance/types";
import { usePrivacy } from "@/hooks/use-privacy";

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
  const { mask } = usePrivacy();
  const { t } = useTranslation();

  const columns: DataTableColumn<Suggestion>[] = [
    {
      key: "token",
      header: t("rebalance.token"),
      align: "left",
      mobile: "identity",
      cell: (suggestion) => (
        <>
          {suggestion.tokenSymbol}
          <span className="ml-2 rounded-sm bg-bg-muted px-1.5 py-0.5 text-caption font-normal text-text-muted">
            {t("rebalance.untargeted")}
          </span>
        </>
      ),
    },
    {
      key: "percent",
      header: t("rebalance.currentPercent"),
      mobile: "meta",
      cell: (suggestion) => `${suggestion.currentPercent.toFixed(1)}%`,
    },
    {
      key: "value",
      header: t("rebalance.currentValue"),
      mobile: "primary",
      cell: (suggestion) => mask(formatUsd(suggestion.currentValue)),
    },
    {
      key: "action",
      header: <span className="sr-only">{t("rebalance.addTarget")}</span>,
      mobile: "note",
      cell: (suggestion) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddTarget(suggestion)}
          disabled={isTargeted(suggestion.tokenSymbol)}
          aria-label={`${t("rebalance.addTarget")}: ${suggestion.tokenSymbol}`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t("rebalance.addTarget")}
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-text-muted">
          {t("rebalance.untargetedTokens")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-body text-text-muted">
          {t("rebalance.untargetedDescription")}
        </p>

        <DataTable
          caption={t("rebalance.untargetedTokens")}
          columns={columns}
          rows={suggestions}
          rowKey={(suggestion) => suggestion.tokenSymbol}
        />
      </CardContent>
    </Card>
  );
}
