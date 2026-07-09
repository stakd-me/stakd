/**
 * Pure view-model helpers for the rebalance screen.
 *
 * These functions are extracted from `use-rebalance` so they can be unit
 * tested in isolation. They must remain side-effect free.
 */

import {
  getHighConcentrationThresholdPercent,
} from "@/lib/constants/risk";
import { resolveCurrentValue } from "@/lib/services/rebalance-strategies";
import type { StrategyContext } from "@/lib/services/rebalance-strategies";
import type {
  Suggestion,
  SuggestionsData,
  Alert,
  AutocompleteSuggestion,
  TokenGroup,
  TokenCategory,
  CategoryBreakdown,
} from "@/components/rebalance/types";

// ── Helper: compute execution steps from suggestions ──────────────

export function computeExecutionSteps(
  suggestions: Suggestion[],
): SuggestionsData["executionSteps"] {
  const actionable = suggestions.filter((s) => s.action !== "hold");
  if (actionable.length === 0) return [];

  const sells = actionable.filter((s) => s.action === "sell");
  const buys = actionable.filter((s) => s.action === "buy");
  const ordered = [...sells, ...buys];

  let runningCash = 0;
  return ordered.map((s, i) => {
    if (s.action === "sell") {
      runningCash += s.amount - s.estimatedSlippage - s.estimatedFee;
    } else {
      runningCash -= s.amount + s.estimatedSlippage + s.estimatedFee;
    }
    return {
      step: i + 1,
      tokenSymbol: s.tokenSymbol,
      action: s.action as "buy" | "sell",
      amount: s.amount,
      estimatedSlippage: s.estimatedSlippage,
      estimatedFee: s.estimatedFee,
      runningCashAfter: Math.round(runningCash * 100) / 100,
    };
  });
}

// ── Helper: compute summary from suggestions ──────────────────────

export function computeSummary(
  suggestions: Suggestion[],
  holdZonePercent: number,
): SuggestionsData["summary"] {
  const actionable = suggestions.filter((s) => !s.isUntargeted);
  const trades = actionable.filter((s) => s.action !== "hold");
  const sellCount = trades.filter((s) => s.action === "sell").length;
  const buyCount = trades.filter((s) => s.action === "buy").length;
  const totalVolume = trades.reduce((sum, s) => sum + s.amount, 0);
  const totalEstimatedFees = trades.reduce(
    (sum, s) => sum + s.estimatedFee + s.estimatedSlippage,
    0
  );
  const portfolioDrift = actionable.reduce(
    (sum, s) => sum + Math.abs(s.deviation),
    0
  );
  const maxDev = actionable.reduce(
    (max, s) => Math.max(max, Math.abs(s.deviation)),
    0
  );
  const maxPostDev = trades.length > 0
    ? actionable.reduce(
        (max, s) =>
          Math.max(
            max,
            s.action !== "hold" ? 0 : Math.abs(s.deviation)
          ),
        0
      )
    : maxDev;

  const isWellBalanced = maxDev <= holdZonePercent;
  const postTradeDrift = actionable.reduce(
    (sum, s) => sum + (s.action === "hold" ? Math.abs(s.deviation) : 0),
    0
  );
  const efficiency = portfolioDrift > 0
      ? Math.max(0, Math.min(100, ((portfolioDrift - postTradeDrift) / portfolioDrift) * 100))
      : 100;

  return {
    tradeCount: trades.length,
    sellCount,
    buyCount,
    totalVolume: Math.round(totalVolume * 100) / 100,
    totalEstimatedFees: Math.round(totalEstimatedFees * 100) / 100,
    portfolioDrift: Math.round(portfolioDrift * 100) / 100,
    portfolioEfficiency: Math.round(efficiency * 100) / 100,
    maxPostRebalanceDeviation: Math.round(maxPostDev * 100) / 100,
    isWellBalanced,
    driftThresholdPercent: holdZonePercent,
  };
}

// ── Helper: compute alerts from targets + portfolio ──────────────

export function computeAlerts(
  targets: { tokenSymbol: string; targetPercent: number }[],
  symbolValues: Record<string, number>,
  strategyContext: StrategyContext | null,
  totalValue: number,
  holdZonePercent: number,
  concentrationThresholdPercent: number,
  stablecoinSymbols: Set<string>,
  excludeStablecoinsFromConcentration: boolean,
): Alert[] {
  if (totalValue === 0) return [];

  const mergedTargets = new Map<string, number>();
  for (const target of targets) {
    const symbol = target.tokenSymbol.toUpperCase();
    mergedTargets.set(symbol, (mergedTargets.get(symbol) || 0) + target.targetPercent);
  }
  const uniqueTargets = Array.from(mergedTargets.entries()).map(([tokenSymbol, targetPercent]) => ({
    tokenSymbol,
    targetPercent,
  }));

  const alerts: Alert[] = [];
  const concentrationSet = new Set<string>();
  const highConcentrationThresholdPercent = getHighConcentrationThresholdPercent(
    concentrationThresholdPercent
  );
  const targetMap: Record<string, number> = {};
  for (const t of uniqueTargets) {
    targetMap[t.tokenSymbol.toUpperCase()] = t.targetPercent;
  }

  for (const t of uniqueTargets) {
    const symbol = t.tokenSymbol.toUpperCase();
    const currentValue = strategyContext
      ? resolveCurrentValue(symbol, strategyContext)
      : (symbolValues[symbol] || 0);
    const currentPercent = (currentValue / totalValue) * 100;
    const deviation = currentPercent - t.targetPercent;

    if (Math.abs(deviation) > holdZonePercent) {
      let severity: Alert["severity"] = "low";
      if (Math.abs(deviation) > holdZonePercent * 3) severity = "high";
      else if (Math.abs(deviation) > holdZonePercent * 2) severity = "medium";

      alerts.push({
        tokenSymbol: symbol,
        targetPercent: t.targetPercent,
        currentPercent: Math.round(currentPercent * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        severity,
        type: "deviation",
      });
    }

    if (
      currentPercent > concentrationThresholdPercent &&
      !(excludeStablecoinsFromConcentration && stablecoinSymbols.has(symbol))
    ) {
      concentrationSet.add(symbol);
      alerts.push({
        tokenSymbol: symbol,
        targetPercent: t.targetPercent,
        currentPercent: Math.round(currentPercent * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        severity:
          currentPercent > highConcentrationThresholdPercent ? "high" : "medium",
        type: "concentration_token",
      });
    }
  }

  for (const [symbol, value] of Object.entries(symbolValues)) {
    if (concentrationSet.has(symbol)) continue;
    if (excludeStablecoinsFromConcentration && stablecoinSymbols.has(symbol)) {
      continue;
    }
    const currentPercent = (value / totalValue) * 100;
    if (currentPercent <= concentrationThresholdPercent) continue;

    const targetPercent = targetMap[symbol] ?? 0;
    const deviation = currentPercent - targetPercent;
    alerts.push({
      tokenSymbol: symbol,
      targetPercent,
      currentPercent: Math.round(currentPercent * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
      severity:
        currentPercent > highConcentrationThresholdPercent ? "high" : "medium",
      type: "concentration_token",
    });
  }

  return alerts;
}

// ── Helper: compute autocomplete from vault data ──────────────────

export function computeAutocompleteSuggestions(
  query: string,
  symbolValues: Record<string, number>,
  groups: TokenGroup[],
): AutocompleteSuggestion[] {
  if (!query || query.length === 0) return [];
  const q = query.toUpperCase();
  const results: AutocompleteSuggestion[] = [];

  for (const [symbol, value] of Object.entries(symbolValues)) {
    if (symbol.includes(q)) {
      results.push({
        symbol,
        name: symbol,
        coingeckoId: null,
        totalBalance: 0,
        totalValueUsd: value,
      });
    }
  }

  for (const g of groups) {
    if (g.name.toUpperCase().includes(q)) {
      results.push({
        symbol: g.name,
        name: `Group: ${g.name}`,
        coingeckoId: null,
        totalBalance: 0,
        totalValueUsd: g.totalValueUsd ?? 0,
        isGroup: true,
      });
    }
  }

  return results.slice(0, 10);
}

// ── Helper: compute category breakdown ────────────────────────────

export function computeCategoryBreakdown(
  categories: TokenCategory[],
  symbolValues: Record<string, number>,
  totalValue: number,
): CategoryBreakdown[] {
  if (categories.length === 0 || totalValue === 0) return [];

  const catTotals: Record<string, number> = {};
  for (const cat of categories) {
    const val = symbolValues[cat.tokenSymbol.toUpperCase()] || 0;
    catTotals[cat.category] = (catTotals[cat.category] || 0) + val;
  }

  return Object.entries(catTotals).map(([category, valueUsd]) => ({
    category,
    valueUsd: Math.round(valueUsd * 100) / 100,
    percent: Math.round((valueUsd / totalValue) * 10000) / 100,
  }));
}
