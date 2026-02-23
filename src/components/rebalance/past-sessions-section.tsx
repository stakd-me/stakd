"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";
import type { RebalanceSession } from "./types";
import { getActionBadge } from "./helpers";

interface PastSessionsSectionProps {
  pastSessions: RebalanceSession[];
  onConfirmDelete: (id: string | number, label: string) => void;
  deletePending: boolean;
}

export function PastSessionsSection({
  pastSessions,
  onConfirmDelete,
  deletePending,
}: PastSessionsSectionProps) {
  const { t } = useTranslation();
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [expandedPastSession, setExpandedPastSession] = useState<string | number | null>(
    null
  );

  if (pastSessions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          className="flex w-full items-center gap-2"
          onClick={() => setShowPastSessions(!showPastSessions)}
          aria-expanded={showPastSessions}
        >
          <History className="h-5 w-5 text-text-subtle" />
          <CardTitle>{t("rebalance.pastSessions")}</CardTitle>
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-subtle">
              {pastSessions.length}
            </span>
            {showPastSessions ? (
              <ChevronUp className="h-5 w-5 text-text-subtle" />
            ) : (
              <ChevronDown className="h-5 w-5 text-text-subtle" />
            )}
          </span>
        </button>
      </CardHeader>
      {showPastSessions && (
        <CardContent>
          <div className="space-y-2">
            {pastSessions.map((session) => (
              <div
                key={session.id}
                className="rounded-md bg-bg-card px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="flex min-w-0 flex-wrap items-center gap-2 text-left"
                    onClick={() =>
                      setExpandedPastSession(
                        expandedPastSession === session.id
                          ? null
                          : session.id
                      )
                    }
                    aria-expanded={expandedPastSession === session.id}
                    aria-label={`Toggle session from ${new Date(session.createdAt).toLocaleDateString()}`}
                  >
                    {expandedPastSession === session.id ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-text-subtle" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-text-subtle" />
                    )}
                    <span className="text-sm text-text-subtle">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </span>
                    <span className="font-medium text-text-primary">
                      {formatUsd(session.totalValueUsd)}
                    </span>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
                        session.status === "completed"
                          ? "border-status-positive-border bg-status-positive-soft text-status-positive"
                          : "border-border/30 bg-bg-muted/20 text-text-subtle"
                      }`}
                    >
                      {session.status}
                    </span>
                    <span className="text-xs text-text-dim">
                      {session.trades.length} trade
                      {session.trades.length !== 1 ? "s" : ""}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-text-subtle hover:text-status-negative"
                    onClick={() =>
                      onConfirmDelete(
                        session.id,
                        `session from ${new Date(session.createdAt).toLocaleDateString()}`
                      )
                    }
                    disabled={deletePending}
                    aria-label={`Delete session from ${new Date(session.createdAt).toLocaleDateString()}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {expandedPastSession === session.id &&
                  session.trades.length > 0 && (
                    <div className="mt-3 space-y-1 pl-7">
                      {session.trades.map((trade) => (
                        <div
                          key={trade.id}
                          className="flex items-center justify-between rounded bg-bg-sidebar/50 px-3 py-1.5 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${getActionBadge(trade.action)}`}
                            >
                              {trade.action}
                            </span>
                            <span className="text-text-primary">
                              {trade.tokenSymbol}
                            </span>
                          </div>
                          <span className="text-text-subtle">
                            {formatUsd(trade.amountUsd)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
