"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import type { RebalanceLog } from "@/components/rebalance/types";

interface RebalanceHistorySectionProps {
  logs: RebalanceLog[];
}

export function RebalanceHistorySection({
  logs,
}: RebalanceHistorySectionProps) {
  const { t } = useTranslation();
  const [historyExpanded, setHistoryExpanded] = useState(false);

  if (logs.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          className="flex w-full items-center gap-2"
          onClick={() => setHistoryExpanded((value) => !value)}
          aria-expanded={historyExpanded}
        >
          <Clock className="h-5 w-5" />
          <CardTitle>{t("rebalance.history")}</CardTitle>
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-subtle">
              {logs.length}
            </span>
            {historyExpanded ? (
              <ChevronUp className="h-5 w-5 text-text-subtle" />
            ) : (
              <ChevronDown className="h-5 w-5 text-text-subtle" />
            )}
          </span>
        </button>
      </CardHeader>
      {historyExpanded ? (
        <CardContent>
          <div className="space-y-3">
            {logs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="rounded-md bg-bg-card px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-subtle">
                    {new Date(log.loggedAt).toLocaleString()}
                  </span>
                  <span className="font-medium text-text-primary">
                    {formatUsd(log.totalValueUsd)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {log.deviationsSnapshot.map((deviation) => (
                    <span
                      key={deviation.tokenSymbol}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        Math.abs(deviation.deviation) > 5
                          ? "bg-status-negative-soft text-status-negative"
                          : Math.abs(deviation.deviation) > 1
                            ? "bg-status-warning-soft text-status-warning"
                            : "bg-status-positive-soft text-status-positive"
                      }`}
                    >
                      {deviation.tokenSymbol}: {deviation.deviation >= 0 ? "+" : ""}
                      {deviation.deviation.toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
