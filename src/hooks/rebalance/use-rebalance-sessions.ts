"use client";

import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { buildTransactionsFromExecutedTrades } from "@/lib/services/rebalance-recording";
import { withAutoStablecoinCategory } from "@/lib/constants/stablecoins";
import type {
  SuggestionsData,
  RebalanceSession,
  RecordedTradeDraft,
} from "@/components/rebalance/types";
import type { RebalancePhase } from "./use-rebalance-phases";
import type { RebalanceCore } from "./use-rebalance-core";

/**
 * Rebalance execution sessions: session list + lifecycle mutations
 * (start/toggle/complete/delete) and the post-execution transaction
 * recording flow.
 */
export function useRebalanceSessions(
  core: RebalanceCore,
  suggestionsData: SuggestionsData | undefined,
  setActivePhase: (phase: RebalancePhase) => void,
  setPhaseInitialized: (initialized: boolean) => void,
) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { vault, ensurePrices } = core;

  // Post-execution recording flow
  const [recordingSessionId, setRecordingSessionId] = useState<string | number | null>(null);
  const [recordingTrades, setRecordingTrades] = useState<RecordedTradeDraft[]>([]);

  // Mutation pending states
  const [startSessionPending, setStartSessionPending] = useState(false);
  const [completeSessionPending, setCompleteSessionPending] = useState(false);
  const [deleteSessionPending, setDeleteSessionPending] = useState(false);
  const [recordTransactionsPending, setRecordTransactionsPending] = useState(false);

  // ── Computed: sessions ────────────────────────────────────────

  const allSessions = useMemo((): RebalanceSession[] => {
    return vault.rebalanceSessions.map((s) => ({
      id: s.id,
      totalValueUsd: s.totalValueUsd,
      status: s.status,
      trades: s.trades.map((tr) => ({
        id: tr.id,
        tokenSymbol: tr.tokenSymbol,
        action: tr.action,
        amountUsd: tr.amountUsd,
        status: tr.status,
      })),
      createdAt: s.createdAt,
    }));
  }, [vault.rebalanceSessions]);

  const activeSessions = allSessions.filter(
    (s) => s.status === "in_progress"
  );
  const pastSessions = allSessions.filter(
    (s) => s.status !== "in_progress"
  ).slice(0, 10);

  // ── Mutations (vault updates) ─────────────────────────────────

  const handleStartSession = useCallback(() => {
    setStartSessionPending(true);
    try {
      const actionable = (suggestionsData?.targets ?? []).filter(
        (s) => !s.isUntargeted && s.action !== "hold"
      );
      if (actionable.length === 0) return;
      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        rebalanceSessions: [
          ...prev.rebalanceSessions,
          {
            id: crypto.randomUUID(),
            totalValueUsd: suggestionsData?.totalValue ?? 0,
            targetsSnapshot: JSON.stringify(
              vault.rebalanceTargets.map((t) => ({
                tokenSymbol: t.tokenSymbol,
                targetPercent: t.targetPercent,
              }))
            ),
            status: "in_progress" as const,
            trades: actionable.map((s) => ({
              id: crypto.randomUUID(),
              tokenSymbol: s.tokenSymbol,
              action: s.action as "buy" | "sell",
              amountUsd: s.amount,
              status: "pending" as const,
              completedAt: null,
            })),
            createdAt: new Date().toISOString(),
            completedAt: null,
          },
        ],
      }));
      setActivePhase("execution");
      setPhaseInitialized(true);
      toast(t("rebalance.sessionStarted"), "success");
    } finally {
      setStartSessionPending(false);
    }
  }, [suggestionsData, vault.rebalanceTargets, setActivePhase, setPhaseInitialized, toast, t]);

  const handleToggleTrade = useCallback(
    (sessionId: string | number, tradeId: string | number) => {
      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        rebalanceSessions: prev.rebalanceSessions.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            trades: s.trades.map((tr) => {
              if (tr.id !== tradeId) return tr;
              const newStatus = tr.status === "completed" ? "pending" as const : "completed" as const;
              return {
                ...tr,
                status: newStatus,
                completedAt: newStatus === "completed" ? new Date().toISOString() : null,
              };
            }),
          };
        }),
      }));
    },
    []
  );

  const handleCompleteSession = useCallback(
    ({ id, status }: { id: string | number; status: string }) => {
      setCompleteSessionPending(true);
      try {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          rebalanceSessions: prev.rebalanceSessions.map((s) => {
            if (s.id !== id) return s;
            return {
              ...s,
              status: status as "completed" | "cancelled",
              completedAt: new Date().toISOString(),
            };
          }),
          ...(status === "completed"
            ? {
                settings: {
                  ...prev.settings,
                  lastRebalanceDate: new Date().toISOString().split("T")[0],
                },
              }
            : {}),
        }));
        toast(t("rebalance.sessionUpdated"), "success");
      } finally {
        setCompleteSessionPending(false);
      }
    },
    [toast, t]
  );

  const handleDeleteSession = useCallback(
    (id: string | number) => {
      setDeleteSessionPending(true);
      try {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          rebalanceSessions: prev.rebalanceSessions.filter((s) => s.id !== id),
        }));
        toast(t("rebalance.deleted"), "success");
      } finally {
        setDeleteSessionPending(false);
      }
    },
    [toast, t]
  );

  const handleRecordTransactions = useCallback(
    async (trades: RecordedTradeDraft[]) => {
      setRecordTransactionsPending(true);
      try {
        const recordedAtIso = new Date().toISOString();
        const { transactions: newTransactions, tokensToEnsure } =
          buildTransactionsFromExecutedTrades(
            vault,
            trades,
            recordedAtIso,
            t("rebalance.recordedFromSession")
          );

        if (newTransactions.length === 0) {
          toast(t("rebalance.enterQuantities"), "error");
          return;
        }

        useVaultStore.getState().updateVault((prev) => {
          let nextTokenCategories = prev.tokenCategories;
          for (const tx of newTransactions) {
            nextTokenCategories = withAutoStablecoinCategory(
              nextTokenCategories,
              tx.tokenSymbol,
              recordedAtIso
            );
          }

          return {
            ...prev,
            transactions: [...prev.transactions, ...newTransactions],
            rebalanceSessions: prev.rebalanceSessions.map((session) =>
              session.id === recordingSessionId
                ? {
                    ...session,
                    status: "completed",
                    completedAt: recordedAtIso,
                  }
                : session
            ),
            tokenCategories: nextTokenCategories,
            settings: {
              ...prev.settings,
              lastRebalanceDate: recordedAtIso.split("T")[0],
            },
          };
        });

        if (tokensToEnsure.length > 0) {
          await ensurePrices(tokensToEnsure);
        }

        setRecordingSessionId(null);
        setRecordingTrades([]);
        toast(t("rebalance.transactionsRecorded"), "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : t("rebalance.failedRecordTransactions");
        toast(message, "error");
      } finally {
        setRecordTransactionsPending(false);
      }
    },
    [ensurePrices, recordingSessionId, toast, t, vault]
  );

  const handleStartRecordingSession = useCallback((session: RebalanceSession) => {
    setRecordingSessionId(session.id);
    setRecordingTrades(
      session.trades.map((trade) => ({
        tokenSymbol: trade.tokenSymbol,
        action: trade.action,
        amountUsd: trade.amountUsd,
        quantity: "",
      }))
    );
  }, []);

  const handleUpdateRecordingTrade = useCallback(
    (index: number, quantity: string) => {
      setRecordingTrades((current) =>
        current.map((trade, tradeIndex) =>
          tradeIndex === index ? { ...trade, quantity } : trade
        )
      );
    },
    []
  );

  const handleSaveRecordedTrades = useCallback(() => {
    void handleRecordTransactions(recordingTrades);
  }, [handleRecordTransactions, recordingTrades]);

  const handleCancelRecordingSession = useCallback(
    (sessionId: string | number) => {
      setRecordingSessionId(null);
      setRecordingTrades([]);
      void handleCompleteSession({
        id: sessionId,
        status: "completed",
      });
    },
    [handleCompleteSession]
  );

  return {
    allSessions,
    activeSessions,
    pastSessions,
    recordingSessionId,
    recordingTrades,
    startSessionPending,
    completeSessionPending,
    deleteSessionPending,
    recordTransactionsPending,
    handleStartSession,
    handleToggleTrade,
    handleCompleteSession,
    handleDeleteSession,
    handleStartRecordingSession,
    handleUpdateRecordingTrade,
    handleSaveRecordedTrades,
    handleCancelRecordingSession,
  };
}
