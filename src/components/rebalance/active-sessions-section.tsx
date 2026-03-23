"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import type {
  RebalanceSession,
  RecordedTradeDraft,
} from "@/components/rebalance/types";
import { CheckCircle2, Play, XCircle } from "lucide-react";

interface SessionCompletionPayload {
  id: string | number;
  status: "completed" | "cancelled";
}

interface ActiveSessionsSectionProps {
  showStartExecutionCallout: boolean;
  startSessionPending: boolean;
  activeSessions: RebalanceSession[];
  completeSessionPending: boolean;
  recordingSessionId: string | number | null;
  recordingTrades: RecordedTradeDraft[];
  recordTransactionsPending: boolean;
  onStartSession: () => void;
  onToggleTrade: (sessionId: string | number, tradeId: string | number) => void;
  onCompleteSession: (payload: SessionCompletionPayload) => void;
  onStartRecording: (session: RebalanceSession) => void;
  onUpdateRecordingTrade: (index: number, quantity: string) => void;
  onSaveRecordedTrades: () => void;
  onCancelRecording: (sessionId: string | number) => void;
}

export function ActiveSessionsSection({
  showStartExecutionCallout,
  startSessionPending,
  activeSessions,
  completeSessionPending,
  recordingSessionId,
  recordingTrades,
  recordTransactionsPending,
  onStartSession,
  onToggleTrade,
  onCompleteSession,
  onStartRecording,
  onUpdateRecordingTrade,
  onSaveRecordedTrades,
  onCancelRecording,
}: ActiveSessionsSectionProps) {
  const { t } = useTranslation();

  return (
    <>
      {showStartExecutionCallout ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-subtle">{t("rebalance.readyToExecute")}</p>
            <Button size="sm" onClick={onStartSession} disabled={startSessionPending}>
              <Play className="mr-2 h-4 w-4" />
              {startSessionPending ? t("rebalance.starting") : t("rebalance.startExecution")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activeSessions.map((session) => {
        const completedCount = session.trades.filter((trade) => trade.status === "completed").length;
        const progress = session.trades.length > 0 ? (completedCount / session.trades.length) * 100 : 0;
        const isRecording = recordingSessionId === session.id;
        const canSaveRecordedTrades = !recordingTrades.every(
          (trade) => !trade.quantity || Number.parseFloat(trade.quantity) <= 0
        );

        return (
          <Card key={session.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-status-info" />
                  {t("rebalance.activeSession")}
                </CardTitle>
                <span className="text-sm text-text-subtle">
                  {completedCount}/{session.trades.length} {t("rebalance.tradesLabel")}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 h-2 w-full rounded-full bg-bg-muted">
                <div
                  className="h-2 rounded-full bg-status-info transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="space-y-2">
                {session.trades.map((trade) => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between rounded-md bg-bg-card px-4 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onToggleTrade(session.id, trade.id)}
                        className="text-text-subtle hover:text-text-primary"
                        aria-label={`Toggle ${trade.tokenSymbol} trade as ${trade.status === "completed" ? "pending" : "completed"}`}
                      >
                        {trade.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-status-positive" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-border" />
                        )}
                      </button>
                      <span
                        className={
                          trade.status === "completed"
                            ? "text-text-dim line-through"
                            : "text-text-primary"
                        }
                      >
                        {trade.action.toUpperCase()} {trade.tokenSymbol}
                      </span>
                    </div>
                    <span className="text-sm text-text-subtle">
                      {formatUsd(trade.amountUsd)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => onCompleteSession({ id: session.id, status: "completed" })}
                  disabled={completeSessionPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t("rebalance.complete")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCompleteSession({ id: session.id, status: "cancelled" })}
                  disabled={completeSessionPending}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  {t("rebalance.cancel")}
                </Button>
              </div>

              {session.trades.every((trade) => trade.status === "completed") && !isRecording ? (
                <div className="mt-4 rounded-md border border-status-info-border bg-status-info-soft p-3">
                  <p className="text-sm text-status-info">
                    {t("rebalance.allTradesCompleted")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onStartRecording(session)}>
                      {t("rebalance.recordTransactions")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCompleteSession({ id: session.id, status: "completed" })}
                    >
                      {t("rebalance.skip")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {isRecording ? (
                <div className="mt-4 space-y-3 rounded-md border border-border bg-bg-card p-3">
                  <h5 className="text-sm font-medium text-text-muted">
                    {t("rebalance.recordExecutedTrades")}
                  </h5>
                  <p className="text-xs text-text-dim">{t("rebalance.enterQuantities")}</p>
                  {recordingTrades.map((trade, index) => (
                    <div
                      key={`${trade.tokenSymbol}-${index}`}
                      className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3"
                    >
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
                          trade.action === "buy"
                            ? "border-status-positive-border bg-status-positive-soft text-status-positive"
                            : "border-status-negative-border bg-status-negative-soft text-status-negative"
                        }`}
                      >
                        {trade.action.toUpperCase()}
                      </span>
                      <span className="w-20 text-sm font-medium text-text-primary">
                        {trade.tokenSymbol}
                      </span>
                      <span className="text-sm text-text-subtle">
                        {formatUsd(trade.amountUsd)}
                      </span>
                      <Input
                        type="number"
                        placeholder={t("rebalance.quantity")}
                        value={trade.quantity}
                        onChange={(event) => onUpdateRecordingTrade(index, event.target.value)}
                        className="w-full sm:w-32"
                        min={0}
                        step="any"
                      />
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={onSaveRecordedTrades}
                      disabled={recordTransactionsPending || !canSaveRecordedTrades}
                    >
                      {recordTransactionsPending
                        ? t("rebalance.recording")
                        : t("rebalance.saveAllTransactions")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCancelRecording(session.id)}
                    >
                      {t("rebalance.cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
