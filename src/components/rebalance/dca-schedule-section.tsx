"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import { Clock } from "lucide-react";
import type { SuggestionsData } from "@/components/rebalance/types";
import { usePrivacy } from "@/hooks/use-privacy";

type Chunk = NonNullable<SuggestionsData["dcaChunks"]>[number];

interface DcaScheduleSectionProps {
  chunks: NonNullable<SuggestionsData["dcaChunks"]>;
  totalChunks: number;
  intervalDays: number;
}

export function DcaScheduleSection({
  chunks,
  totalChunks,
  intervalDays,
}: DcaScheduleSectionProps) {
  const { mask } = usePrivacy();
  const { t } = useTranslation();

  if (chunks.length === 0) {
    return null;
  }

  const columns: DataTableColumn<Chunk>[] = [
    {
      key: "chunk",
      header: t("rebalance.chunk"),
      align: "left",
      mobile: "identity",
      cell: (chunk) => <span className="font-mono tabular">#{chunk.chunkIndex}</span>,
    },
    {
      key: "date",
      header: t("rebalance.date"),
      align: "left",
      mobile: "primary",
      cell: (chunk) => chunk.scheduledDate,
    },
    {
      key: "trades",
      header: t("rebalance.tradesLabel"),
      align: "left",
      mobile: "note",
      cell: (chunk) => (
        <span className="flex flex-wrap gap-2">
          {chunk.trades.map((trade) => (
            <span
              key={trade.tokenSymbol}
              className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-0.5 font-mono text-caption text-text-secondary"
            >
              <span className="font-sans font-semibold text-text-primary">
                {trade.action === "buy" || trade.action === "sell"
                  ? t(`rebalance.action.${trade.action}`)
                  : trade.action}
              </span>
              {trade.tokenSymbol} {mask(formatUsd(trade.amount))}
            </span>
          ))}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-text-muted" aria-hidden="true" />
          {t("rebalance.dcaSchedule")} ({totalChunks} {t("rebalance.chunks")}, {t("rebalance.every")} {intervalDays} {t("rebalance.days")})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-body text-text-muted">
          {t("rebalance.dcaDescription", { chunks: totalChunks })}
        </p>
        <DataTable
          caption={t("rebalance.dcaSchedule")}
          columns={columns}
          rows={chunks}
          rowKey={(chunk) => String(chunk.chunkIndex)}
        />
      </CardContent>
    </Card>
  );
}
