"use client";

import { useMemo } from "react";
import { useTranslation } from "@/hooks/use-translation";
import { useNow } from "@/hooks/use-now";
import { useRiskParityVolatility } from "@/hooks/use-risk-parity-volatility";
import {
  buildStrategyContext,
  dispatchStrategy,
} from "@/lib/services/rebalance-strategies";
import type { StrategyOutput } from "@/lib/services/rebalance-strategies";
import { getOldestPriceUpdateForTokens } from "@/lib/pricing/freshness";
import {
  computeAlerts,
  computeExecutionSteps,
  computeSummary,
} from "@/lib/services/rebalance-view";
import type { Suggestion, SuggestionsData } from "@/components/rebalance/types";
import type { RebalanceCore } from "./use-rebalance-core";

/**
 * Strategy evaluation for the rebalance screen: strategy context,
 * suggestions, alerts, and the derived suggestion collections.
 */
export function useRebalanceSuggestions(core: RebalanceCore) {
  const { t } = useTranslation();
  const {
    vault,
    priceMap,
    pricesUpdatedAt,
    pricesLoading,
    settings,
    rebalanceStrategy,
    holdZonePercent,
    minTradeUsd,
    buyOnlyMode,
    newCashUsd,
    cashReserveUsd,
    cashReservePercent,
    dustThresholdUsd,
    slippagePercent,
    tradingFeePercent,
    autoRefreshMinutes,
    concentrationThresholdPercent,
    excludeStablecoinsFromConcentration,
    treatStablecoinsAsCashReserve,
    lastRebalanceDate,
    riskParityLookbackDays,
    symbolValues,
    totalValue,
    stablecoinSymbols,
  } = core;

  // ── Computed: strategy context + suggestions ─────────────────

  const strategyContext = useMemo(() => {
    if (vault.rebalanceTargets.length === 0 && Object.keys(priceMap).length === 0) {
      return null;
    }
    try {
      return buildStrategyContext(vault, priceMap);
    } catch {
      return null;
    }
  }, [vault, priceMap]);

  const riskParityTokenIds = useMemo(() => {
    if (!strategyContext || rebalanceStrategy !== "risk-parity") {
      return [];
    }
    return Array.from(
      new Set(
        strategyContext.targets
          .map((target) => {
            const symbol = target.tokenSymbol.toUpperCase();
            return target.coingeckoId || strategyContext.symbolCoingeckoMap[symbol] || "";
          })
          .filter((id) => id.length > 0)
      )
    );
  }, [strategyContext, rebalanceStrategy]);

  const { volatilities: riskParityVolatilities } = useRiskParityVolatility(
    riskParityTokenIds,
    rebalanceStrategy === "risk-parity",
    riskParityLookbackDays
  );

  const strategyOutput = useMemo((): StrategyOutput | null => {
    if (!strategyContext) {
      return null;
    }

    try {
      return dispatchStrategy(
        rebalanceStrategy,
        strategyContext,
        settings,
        rebalanceStrategy === "risk-parity" ? riskParityVolatilities : undefined
      );
    } catch {
      return null;
    }
  }, [strategyContext, rebalanceStrategy, settings, riskParityVolatilities]);

  const suggestionsData = useMemo((): SuggestionsData | undefined => {
    if (!strategyOutput) return undefined;

    const allSuggestions: Suggestion[] = [...strategyOutput.suggestions];

    const coveredSymbols = new Set<string>();
    for (const target of vault.rebalanceTargets) {
      const targetSymbol = target.tokenSymbol.trim().toUpperCase();
      if (!targetSymbol) continue;

      coveredSymbols.add(targetSymbol);

      const groupedMembers = strategyContext?.groupMembers[targetSymbol] ?? [];
      for (const member of groupedMembers) {
        coveredSymbols.add(member.toUpperCase());
      }
    }
    for (const [symbol, value] of Object.entries(symbolValues)) {
      if (
        treatStablecoinsAsCashReserve &&
        stablecoinSymbols.has(symbol.toUpperCase())
      ) {
        continue;
      }
      if (value > dustThresholdUsd && !coveredSymbols.has(symbol.toUpperCase())) {
        const currentPercent = totalValue > 0 ? (value / totalValue) * 100 : 0;
        allSuggestions.push({
          tokenSymbol: symbol,
          coingeckoId: null,
          targetPercent: 0,
          currentPercent: Math.round(currentPercent * 100) / 100,
          currentValue: Math.round(value * 100) / 100,
          targetValue: 0,
          deviation: Math.round(currentPercent * 100) / 100,
          action: "hold",
          amount: 0,
          estimatedSlippage: 0,
          estimatedFee: 0,
          netAmount: 0,
          isUntargeted: true,
          isDust: false,
        });
      }
    }

    const summary = computeSummary(allSuggestions, holdZonePercent);
    const executionSteps = computeExecutionSteps(allSuggestions);

    const relevantPriceTokens: { coingeckoId: string | null; symbol: string }[] = [];

    for (const suggestion of allSuggestions) {
      if (suggestion.coingeckoId) {
        relevantPriceTokens.push({
          coingeckoId: suggestion.coingeckoId,
          symbol: suggestion.tokenSymbol,
        });
        continue;
      }
      const mappedId = strategyContext?.symbolCoingeckoMap[
        suggestion.tokenSymbol.toUpperCase()
      ];
      if (mappedId) {
        relevantPriceTokens.push({
          coingeckoId: mappedId,
          symbol: suggestion.tokenSymbol,
        });
      }
    }

    for (const target of strategyContext?.targets ?? []) {
      if (target.coingeckoId) {
        relevantPriceTokens.push({
          coingeckoId: target.coingeckoId,
          symbol: target.tokenSymbol,
        });
      }
    }

    const oldestFromRelevantTokens = getOldestPriceUpdateForTokens(
      priceMap,
      relevantPriceTokens
    );
    const oldestPriceUpdate = oldestFromRelevantTokens
      ? oldestFromRelevantTokens
      : relevantPriceTokens.length > 0
        ? null
        : pricesUpdatedAt ?? null;

    return {
      totalValue,
      targets: allSuggestions,
      holdZonePercent,
      minTradeUsd,
      buyOnlyMode,
      newCashUsd,
      cashReserveUsd,
      cashReservePercent,
      dustThresholdUsd,
      slippagePercent,
      tradingFeePercent,
      summary,
      executionSteps,
      lastRebalanceTime: lastRebalanceDate,
      oldestPriceUpdate,
      autoRefreshMinutes,
      rebalanceStrategy,
      calendarBlocked: strategyOutput.calendarBlocked,
      nextRebalanceDate: strategyOutput.nextRebalanceDate,
      riskParityTargets: strategyOutput.riskParityTargets,
      dcaChunks: strategyOutput.dcaChunks,
      dcaTotalChunks: strategyOutput.dcaTotalChunks,
      dcaIntervalDays: strategyOutput.dcaIntervalDays,
    };
  }, [
    strategyOutput, vault.rebalanceTargets, symbolValues, totalValue,
    holdZonePercent, minTradeUsd, buyOnlyMode, newCashUsd,
    cashReserveUsd, cashReservePercent, dustThresholdUsd,
    slippagePercent, tradingFeePercent, autoRefreshMinutes,
    lastRebalanceDate, rebalanceStrategy, pricesUpdatedAt,
    stablecoinSymbols, treatStablecoinsAsCashReserve,
    priceMap, strategyContext,
  ]);

  // ── Computed: alerts ──────────────────────────────────────────

  const alertsData = useMemo(() => {
    const alertSymbolValues = strategyContext?.symbolValues ?? symbolValues;
    const alertTotalValue = strategyContext?.effectiveTotal ?? totalValue;
    const alerts = computeAlerts(
      vault.rebalanceTargets.map((t) => ({
        tokenSymbol: t.tokenSymbol,
        targetPercent: t.targetPercent,
      })),
      alertSymbolValues,
      strategyContext,
      alertTotalValue,
      holdZonePercent,
      concentrationThresholdPercent,
      stablecoinSymbols,
      excludeStablecoinsFromConcentration,
    );
    return { alerts };
  }, [
    vault.rebalanceTargets,
    symbolValues,
    totalValue,
    holdZonePercent,
    concentrationThresholdPercent,
    strategyContext,
    stablecoinSymbols,
    excludeStablecoinsFromConcentration,
  ]);

  // ── Derived data ─────────────────────────────────────────────

  const allAlerts = alertsData?.alerts ?? [];
  const deviationAlerts = allAlerts.filter((a) => a.type === "deviation");
  const concentrationAlerts = allAlerts.filter(
    (a) => a.type === "concentration_token"
  );
  const hasConcentrationRisk = concentrationAlerts.length > 0;

  const targetedSuggestions = (suggestionsData?.targets ?? []).filter(
    (s) => !s.isUntargeted
  );
  const targetedSuggestionsSorted = useMemo(
    () => [...targetedSuggestions].sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)),
    [targetedSuggestions]
  );
  const actionableSuggestions = useMemo(
    () => targetedSuggestionsSorted.filter((s) => s.action !== "hold"),
    [targetedSuggestionsSorted]
  );
  const hasActionableSuggestions = actionableSuggestions.length > 0;
  const maxDeviation = useMemo(
    () => targetedSuggestionsSorted.reduce((max, s) => Math.max(max, Math.abs(s.deviation)), 0),
    [targetedSuggestionsSorted]
  );
  const totalSuggestedVolume = useMemo(
    () => actionableSuggestions.reduce((sum, s) => sum + s.amount, 0),
    [actionableSuggestions]
  );
  const untargetedSuggestions = (suggestionsData?.targets ?? []).filter(
    (s) => s.isUntargeted
  );

  const suggestionsLoading = pricesLoading;
  const now = useNow(30_000);

  const isPriceStale = useMemo(() => {
    const oldest = suggestionsData?.oldestPriceUpdate;
    if (!oldest) return false;
    return now - new Date(oldest).getTime() > 60 * 1000;
  }, [suggestionsData?.oldestPriceUpdate, now]);

  const chartData = targetedSuggestionsSorted.map((s) => ({
    name: s.tokenSymbol,
    Target: s.targetPercent,
    Current: s.currentPercent,
  }));
  const targetVsCurrentChartSummary = useMemo(() => {
    if (targetedSuggestionsSorted.length === 0) return "";
    const largestDeviation = targetedSuggestionsSorted[0];
    return t("rebalance.deviationChartSummary", {
      count: targetedSuggestionsSorted.length,
      symbol: largestDeviation.tokenSymbol,
      deviation: Math.abs(largestDeviation.deviation).toFixed(1),
    });
  }, [t, targetedSuggestionsSorted]);

  return {
    strategyContext,
    suggestionsData,
    alertsData,
    allAlerts,
    deviationAlerts,
    concentrationAlerts,
    hasConcentrationRisk,
    targetedSuggestions,
    targetedSuggestionsSorted,
    actionableSuggestions,
    hasActionableSuggestions,
    maxDeviation,
    totalSuggestedVolume,
    untargetedSuggestions,
    suggestionsLoading,
    isPriceStale,
    chartData,
    targetVsCurrentChartSummary,
  };
}

export type RebalanceSuggestions = ReturnType<typeof useRebalanceSuggestions>;
