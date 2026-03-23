"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import { Clock } from "lucide-react";
import type { SuggestionsData } from "@/components/rebalance/types";

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
  const { t } = useTranslation();

  if (chunks.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-status-info" />
          {t("rebalance.dcaSchedule")} ({totalChunks} {t("rebalance.chunks")}, {t("rebalance.every")} {intervalDays} {t("rebalance.days")})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-text-subtle">
          {t("rebalance.dcaDescription", { chunks: totalChunks })}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("rebalance.dcaSchedule")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-text-subtle">
                <th scope="col" className="pb-2 pr-4">{t("rebalance.chunk")}</th>
                <th scope="col" className="pb-2 pr-4">{t("rebalance.date")}</th>
                <th scope="col" className="pb-2">{t("rebalance.tradesLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {chunks.map((chunk) => (
                <tr key={chunk.chunkIndex} className="border-b border-border-subtle">
                  <th scope="row" className="py-2 pr-4 text-left text-text-muted">#{chunk.chunkIndex}</th>
                  <td className="py-2 pr-4 text-text-primary">{chunk.scheduledDate}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {chunk.trades.map((trade) => (
                        <span
                          key={trade.tokenSymbol}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                            trade.action === "buy"
                              ? "bg-status-positive-soft text-status-positive"
                              : "bg-status-negative-soft text-status-negative"
                          }`}
                        >
                          {trade.action.toUpperCase()} {trade.tokenSymbol} {formatUsd(trade.amount)}
                        </span>
                      ))}
                    </div>
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
