"use client";

import { useMemo } from "react";
import type { VaultData } from "@/lib/crypto/vault-types";
import type { TranslationKeys } from "@/i18n";
import type { PriceMap } from "@/hooks/use-prices";
import {
  getHighConcentrationThresholdPercent,
  parseConcentrationAlertThresholdPercent,
} from "@/lib/constants/risk";
import { buildStablecoinSymbolSet } from "@/lib/constants/stablecoins";
import {
  buildStrategyContext,
  dispatchStrategy,
} from "@/lib/services/rebalance-strategies";
import type { RebalanceStrategy } from "@/components/rebalance/types";

export type DashboardAlertSeverity = "low" | "medium" | "high";
type DashboardAlertType = "deviation" | "concentration_token";

export interface DashboardAlert {
  tokenSymbol: string;
  deviation: number;
  severity: DashboardAlertSeverity;
  type: DashboardAlertType;
  smartHint?: string; // profit/loss-aware suggestion
}

interface BreakdownLike {
  symbol: string;
  percent: number;
  unrealizedPLPercent: number;
}

interface UseDashboardAlertsInput {
  vault: VaultData;
  priceMap: PriceMap;
  breakdown: BreakdownLike[];
  marketPhase: string | null;
  t: (key: TranslationKeys, replacements?: Record<string, string | number>) => string;
}

/**
 * The dashboard's rebalance and concentration alerts, kept consistent with
 * the Rebalance page's strategy output and merged one badge per token.
 */
export function useDashboardAlerts({
  vault,
  priceMap,
  breakdown,
  marketPhase,
  t,
}: UseDashboardAlertsInput) {
  const rebalanceStrategy = (vault.settings.rebalanceStrategy || "percent-of-portfolio") as RebalanceStrategy;
  const parsedHoldZonePercent = parseFloat(vault.settings.holdZonePercent || "5");
  const holdZonePercent = Number.isFinite(parsedHoldZonePercent) ? parsedHoldZonePercent : 5;
  const concentrationThresholdPercent = parseConcentrationAlertThresholdPercent(
    vault.settings.concentrationThresholdPercent
  );
  const excludeStablecoinsFromConcentration =
    vault.settings.excludeStablecoinsFromConcentration === "1";
  const highConcentrationThresholdPercent = getHighConcentrationThresholdPercent(
    concentrationThresholdPercent
  );
  const stablecoinSymbols = useMemo(
    () => buildStablecoinSymbolSet(vault.tokenCategories),
    [vault.tokenCategories]
  );


  const strategyContext = useMemo(() => {
    if (vault.rebalanceTargets.length === 0 || Object.keys(priceMap).length === 0) {
      return null;
    }
    try {
      return buildStrategyContext(vault, priceMap);
    } catch {
      return null;
    }
  }, [vault, priceMap]);

  const strategyOutput = useMemo(() => {
    if (!strategyContext) return null;
    try {
      return dispatchStrategy(rebalanceStrategy, strategyContext, vault.settings);
    } catch {
      return null;
    }
  }, [rebalanceStrategy, strategyContext, vault.settings]);

  // Build symbol → P&L lookup for smart rebalance hints
  const holdingPLMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of breakdown) {
      map[item.symbol.toUpperCase()] = item.unrealizedPLPercent;
    }
    return map;
  }, [breakdown]);

  // Keep "need rebalancing" consistent with the Rebalance page execution logic.
  // Enhanced with smart profit/loss-aware suggestions.
  const deviationAlerts = useMemo(() => {
    const suggestions = strategyOutput?.suggestions ?? [];
    return suggestions
      .filter((suggestion) => suggestion.action !== "hold")
      .map((suggestion) => {
        const absDeviation = Math.abs(suggestion.deviation);
        const severity: DashboardAlertSeverity =
          absDeviation > holdZonePercent * 3
            ? "high"
            : absDeviation > holdZonePercent * 2
              ? "medium"
              : "low";

        // Smart hint based on profit/loss state
        const plPercent = holdingPLMap[suggestion.tokenSymbol.toUpperCase()] ?? 0;
        let smartHint: string | undefined;

        if (suggestion.action === "sell" && suggestion.deviation > 0) {
          // Overweight
          if (plPercent >= 0) {
            smartHint = t("dashboard.smartHintOverweightProfit", {
              symbol: suggestion.tokenSymbol,
              pl: plPercent.toFixed(1),
            });
          } else {
            smartHint = t("dashboard.smartHintOverweightLoss", {
              symbol: suggestion.tokenSymbol,
              pl: Math.abs(plPercent).toFixed(1),
            });
          }
        } else if (suggestion.action === "buy" && suggestion.deviation < 0) {
          // Underweight
          if (marketPhase === "danger") {
            smartHint = t("dashboard.smartHintUnderweightDanger", {
              symbol: suggestion.tokenSymbol,
            });
          } else {
            smartHint = t("dashboard.smartHintUnderweightBuy", {
              symbol: suggestion.tokenSymbol,
            });
          }
        }

        return {
          tokenSymbol: suggestion.tokenSymbol,
          deviation: suggestion.deviation,
          severity,
          type: "deviation" as const,
          smartHint,
        };
      });
  }, [strategyOutput, holdZonePercent, holdingPLMap, marketPhase, t]);

  const concentrationAlerts = useMemo(() => {
    const result: DashboardAlert[] = [];
    for (const item of breakdown) {
      const normalizedSymbol = item.symbol.toUpperCase();
      if (
        excludeStablecoinsFromConcentration &&
        stablecoinSymbols.has(normalizedSymbol)
      ) {
        continue;
      }
      if (item.percent > concentrationThresholdPercent) {
        result.push({
          tokenSymbol: item.symbol,
          deviation: item.percent,
          severity:
            item.percent > highConcentrationThresholdPercent
              ? "high"
              : "medium",
          type: "concentration_token",
        });
      }
    }
    return result;
  }, [
    breakdown,
    excludeStablecoinsFromConcentration,
    stablecoinSymbols,
    concentrationThresholdPercent,
    highConcentrationThresholdPercent,
  ]);

  const alerts = useMemo(
    () => [...deviationAlerts, ...concentrationAlerts],
    [deviationAlerts, concentrationAlerts]
  );
  const mergedAlertBadges = useMemo(() => {
    const severityRank: Record<DashboardAlertSeverity, number> = {
      low: 1,
      medium: 2,
      high: 3,
    };
    const map = new Map<string, {
      tokenSymbol: string;
      severity: DashboardAlertSeverity;
      deviation: number | null;
      concentration: number | null;
      smartHint?: string;
    }>();

    for (const alert of alerts) {
      const symbol = alert.tokenSymbol.toUpperCase();
      const existing = map.get(symbol);
      if (!existing) {
        map.set(symbol, {
          tokenSymbol: alert.tokenSymbol,
          severity: alert.severity,
          deviation: alert.type === "deviation" ? alert.deviation : null,
          concentration:
            alert.type === "concentration_token" ? alert.deviation : null,
          smartHint: alert.smartHint,
        });
        continue;
      }

      if (severityRank[alert.severity] > severityRank[existing.severity]) {
        existing.severity = alert.severity;
      }
      if (alert.type === "deviation") {
        existing.deviation = alert.deviation;
        if (alert.smartHint) existing.smartHint = alert.smartHint;
      }
      if (alert.type === "concentration_token") {
        existing.concentration = alert.deviation;
      }
    }

    return [...map.values()]
      .map((entry) => ({
        tokenSymbol: entry.tokenSymbol,
        severity: entry.severity,
        value:
          entry.concentration !== null
            ? entry.concentration
            : (entry.deviation ?? 0),
        smartHint: entry.smartHint,
      }))
      .sort(
        (a, b) =>
          severityRank[b.severity] - severityRank[a.severity] ||
          Math.abs(b.value) - Math.abs(a.value)
      );
  }, [alerts]);

  return { alerts, mergedAlertBadges };
}
