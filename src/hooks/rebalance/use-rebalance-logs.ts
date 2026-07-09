"use client";

import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { resolveCurrentValue } from "@/lib/services/rebalance-strategies";
import type { StrategyContext } from "@/lib/services/rebalance-strategies";
import type { RebalanceLog } from "@/components/rebalance/types";
import type { RebalanceCore } from "./use-rebalance-core";

/**
 * Rebalance snapshot logs: the parsed log history plus the
 * "log snapshot" mutation.
 */
export function useRebalanceLogs(
  core: RebalanceCore,
  strategyContext: StrategyContext | null,
) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { vault, symbolValues, totalValue } = core;

  const [logPending, setLogPending] = useState(false);

  const logs = useMemo((): RebalanceLog[] => {
    return vault.rebalanceLogs.map((log) => ({
      id: log.id,
      totalValueUsd: log.totalValueUsd,
      targetsSnapshot: JSON.parse(log.targetsSnapshot || "[]"),
      deviationsSnapshot: JSON.parse(log.deviationsSnapshot || "[]"),
      loggedAt: log.loggedAt,
    }));
  }, [vault.rebalanceLogs]);

  const handleLogSnapshot = useCallback(() => {
    setLogPending(true);
    try {
      const deviations = vault.rebalanceTargets.map((tgt) => {
        const sym = tgt.tokenSymbol.toUpperCase();
        const val = strategyContext
          ? resolveCurrentValue(sym, strategyContext)
          : (symbolValues[sym] || 0);
        const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
        return {
          tokenSymbol: sym,
          targetPercent: tgt.targetPercent,
          currentPercent: Math.round(pct * 100) / 100,
          deviation: Math.round((pct - tgt.targetPercent) * 100) / 100,
          currentValue: Math.round(val * 100) / 100,
        };
      });

      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        rebalanceLogs: [
          ...prev.rebalanceLogs,
          {
            id: crypto.randomUUID(),
            totalValueUsd: Math.round(totalValue * 100) / 100,
            targetsSnapshot: JSON.stringify(
              vault.rebalanceTargets.map((t) => ({
                tokenSymbol: t.tokenSymbol,
                targetPercent: t.targetPercent,
              }))
            ),
            deviationsSnapshot: JSON.stringify(deviations),
            loggedAt: new Date().toISOString(),
          },
        ],
      }));
      toast(t("rebalance.snapshotLogged"), "success");
    } catch {
      toast(t("rebalance.failedSnapshot"), "error");
    } finally {
      setLogPending(false);
    }
  }, [strategyContext, symbolValues, totalValue, vault.rebalanceTargets, toast, t]);

  return {
    logs,
    logPending,
    handleLogSnapshot,
  };
}
