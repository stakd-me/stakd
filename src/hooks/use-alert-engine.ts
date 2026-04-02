"use client";

import { useMemo, useState, useCallback } from "react";
import { buildStablecoinSymbolSet } from "@/lib/constants/stablecoins";
import {
  type ActiveAlert,
  parseAlertRules,
  evaluateAlertRules,
} from "@/lib/alert-rules";
import type { PortfolioBreakdownItem } from "@/hooks/use-portfolio";
import type { MarketSignalData } from "@/hooks/use-market-signal";
import type { VaultTokenCategory } from "@/lib/crypto/vault-types";

interface UseAlertEngineParams {
  alertRulesJson: string | undefined;
  breakdown: PortfolioBreakdownItem[];
  totalValueUsd: number;
  tokenCategories: VaultTokenCategory[];
  marketSignal: MarketSignalData | undefined;
}

export function useAlertEngine({
  alertRulesJson,
  breakdown,
  totalValueUsd,
  tokenCategories,
  marketSignal,
}: UseAlertEngineParams) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const rules = useMemo(
    () => parseAlertRules(alertRulesJson),
    [alertRulesJson]
  );

  const stablecoinSymbols = useMemo(
    () => buildStablecoinSymbolSet(tokenCategories),
    [tokenCategories]
  );

  const alerts = useMemo((): ActiveAlert[] => {
    if (rules.length === 0) return [];

    const holdingsPL: Record<string, { unrealizedPLPercent: number; currentValue: number }> = {};
    for (const item of breakdown) {
      holdingsPL[item.symbol.toUpperCase()] = {
        unrealizedPLPercent: item.unrealizedPLPercent,
        currentValue: item.value,
      };
    }

    let stablecoinValue = 0;
    for (const item of breakdown) {
      if (stablecoinSymbols.has(item.symbol.toUpperCase())) {
        stablecoinValue += item.value;
      }
    }
    const stablecoinPercent =
      totalValueUsd > 0 ? (stablecoinValue / totalValueUsd) * 100 : 0;

    return evaluateAlertRules(rules, {
      holdingsPL,
      fearGreedValue: marketSignal?.fearGreed?.value ?? null,
      marketPhase: marketSignal?.composite.phase ?? null,
      stablecoinPercent,
      totalValueUsd,
    });
  }, [rules, breakdown, totalValueUsd, marketSignal, stablecoinSymbols]);

  const visibleAlerts = useMemo(
    () => alerts.filter((a) => !dismissedIds.has(a.id)),
    [alerts, dismissedIds]
  );

  const dismiss = useCallback((alertId: string) => {
    setDismissedIds((prev) => new Set(prev).add(alertId));
  }, []);

  const dismissAll = useCallback(() => {
    setDismissedIds(new Set(alerts.map((a) => a.id)));
  }, [alerts]);

  return {
    alerts: visibleAlerts,
    totalAlertCount: alerts.length,
    dismiss,
    dismissAll,
  };
}
