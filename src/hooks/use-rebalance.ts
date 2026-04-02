"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import { useRiskParityVolatility } from "@/hooks/use-risk-parity-volatility";
import { buildTransactionsFromExecutedTrades } from "@/lib/services/rebalance-recording";
import {
  getHighConcentrationThresholdPercent,
  parseConcentrationAlertThresholdPercent,
} from "@/lib/constants/risk";
import {
  buildStablecoinSymbolSet,
  withAutoStablecoinCategory,
} from "@/lib/constants/stablecoins";
import {
  buildStrategyContext,
  dispatchStrategy,
  resolveCurrentValue,
} from "@/lib/services/rebalance-strategies";
import type { StrategyContext, StrategyOutput } from "@/lib/services/rebalance-strategies";
import { getSymbolValues } from "@/lib/services/portfolio-calculator";
import { getOldestPriceUpdateForTokens } from "@/lib/pricing/freshness";
import { resolveCanonicalCoinGeckoIdBySymbol } from "@/lib/pricing/binance-symbol-resolver";
import { formatUsd } from "@/lib/utils";
import type { RebalanceStrategy } from "@/components/rebalance/types";
import type {
  TargetRow,
  Suggestion,
  SuggestionsData,
  Alert,
  AutocompleteSuggestion,
  TokenGroup,
  RebalanceSession,
  RecordedTradeDraft,
  TokenCategory,
  CategoryBreakdown,
  RebalanceLog,
  ConfirmState,
} from "@/components/rebalance/types";

// ── Helper: compute execution steps from suggestions ──────────────

function computeExecutionSteps(
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

function computeSummary(
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

function computeAlerts(
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

function computeAutocompleteSuggestions(
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

function computeCategoryBreakdown(
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

function normalizeCoinGeckoId(
  value: string | null | undefined
): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

const TARGET_EXPANDED_STORAGE_KEY = "rebalance:target-allocation-expanded";

export type RebalancePhase = "setup" | "analysis" | "execution" | "all";

export function useRebalance() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [isSeeded, setIsSeeded] = useState(false);

  // Autocomplete state
  const [activeAutocompleteIndex, setActiveAutocompleteIndex] = useState<
    number | null
  >(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");

  // Collapsible sections
  const [targetExpanded, setTargetExpanded] = useState(false);
  const [targetExpandedPref, setTargetExpandedPref] = useState<boolean | null>(null);
  const [activePhase, setActivePhase] = useState<RebalancePhase>("setup");
  const [phaseInitialized, setPhaseInitialized] = useState(false);

  // Post-execution recording flow
  const [recordingSessionId, setRecordingSessionId] = useState<string | number | null>(null);
  const [recordingTrades, setRecordingTrades] = useState<RecordedTradeDraft[]>([]);

  // Delete confirmation
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // Mutation pending states
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logPending, setLogPending] = useState(false);
  const [groupCreatePending, setGroupCreatePending] = useState(false);
  const [groupUpdatePending, setGroupUpdatePending] = useState(false);
  const [groupDeletePending, setGroupDeletePending] = useState(false);
  const [groupTrackPendingId, setGroupTrackPendingId] = useState<string | number | null>(null);
  const [categorySetPending, setCategorySetPending] = useState(false);
  const [categoryDeletePending, setCategoryDeletePending] = useState(false);
  const [startSessionPending, setStartSessionPending] = useState(false);
  const [completeSessionPending, setCompleteSessionPending] = useState(false);
  const [deleteSessionPending, setDeleteSessionPending] = useState(false);
  const [recordTransactionsPending, setRecordTransactionsPending] = useState(false);

  // ── Vault data ─────────────────────────────────────────────

  const vault = useVaultStore((s) => s.vault);
  const {
    priceMap,
    updatedAt: pricesUpdatedAt,
    isLoading: pricesLoading,
    ensurePrices,
  } = usePrices();

  const savedTargets = useMemo((): TargetRow[] => {
    return vault.rebalanceTargets.map((t) => ({
      tokenSymbol: t.tokenSymbol,
      targetPercent: t.targetPercent,
      coingeckoId: t.coingeckoId || "",
    }));
  }, [vault.rebalanceTargets]);

  useEffect(() => {
    if (savedTargets.length > 0 && !isSeeded) {
      setTargets(savedTargets);
      setIsSeeded(true);
    }
  }, [savedTargets, isSeeded]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(TARGET_EXPANDED_STORAGE_KEY);
    const pref = raw === "1" ? true : raw === "0" ? false : null;
    setTargetExpandedPref(pref);
    if (pref !== null) {
      setTargetExpanded(pref);
    }
  }, []);

  useEffect(() => {
    if (targets.length === 0) {
      setTargetExpanded(true);
      return;
    }
    if (targetExpandedPref !== null) {
      setTargetExpanded(targetExpandedPref);
    }
  }, [targets.length, targetExpandedPref]);

  const handleToggleTargetExpanded = useCallback(() => {
    setTargetExpanded((prev) => {
      const next = !prev;
      if (targets.length > 0 && typeof window !== "undefined") {
        window.localStorage.setItem(
          TARGET_EXPANDED_STORAGE_KEY,
          next ? "1" : "0"
        );
        setTargetExpandedPref(next);
      }
      return next;
    });
  }, [targets.length]);

  // ── Computed: strategy context + suggestions ─────────────────

  const settings = vault.settings;
  const rebalanceStrategy = (settings.rebalanceStrategy || "percent-of-portfolio") as RebalanceStrategy;
  const holdZonePercent = parseFloat(settings.holdZonePercent || "5");
  const minTradeUsd = parseFloat(settings.minTradeUsd || "50");
  const buyOnlyMode = settings.buyOnlyMode === "1";
  const newCashUsd = parseFloat(settings.newCashUsd || "0");
  const cashReserveUsd = parseFloat(settings.cashReserveUsd || "0");
  const cashReservePercent = parseFloat(settings.cashReservePercent || "0");
  const dustThresholdUsd = parseFloat(settings.dustThresholdUsd || "1");
  const slippagePercent = parseFloat(settings.slippagePercent || "0.5");
  const tradingFeePercent = parseFloat(settings.tradingFeePercent || "0.1");
  const autoRefreshMinutes = parseFloat(settings.autoRefreshMinutes || "15");
  const concentrationThresholdPercent = parseConcentrationAlertThresholdPercent(
    settings.concentrationThresholdPercent
  );
  const excludeStablecoinsFromConcentration =
    settings.excludeStablecoinsFromConcentration === "1";
  const treatStablecoinsAsCashReserve =
    settings.treatStablecoinsAsCashReserve === "1";
  const concentrationThresholdLabel = Number.isInteger(concentrationThresholdPercent)
    ? concentrationThresholdPercent.toString()
    : concentrationThresholdPercent.toFixed(1);
  const lastRebalanceDate = settings.lastRebalanceDate || null;
  const parsedRiskParityLookbackDays = parseFloat(
    settings.riskParityLookbackDays || "30"
  );
  const riskParityLookbackDays = Number.isFinite(parsedRiskParityLookbackDays)
    ? Math.max(7, Math.min(365, Math.round(parsedRiskParityLookbackDays)))
    : 30;

  const { symbolValues, totalValue } = useMemo(
    () => getSymbolValues(vault, priceMap),
    [vault, priceMap]
  );
  const stablecoinSymbols = useMemo(
    () => buildStablecoinSymbolSet(vault.tokenCategories),
    [vault.tokenCategories]
  );
  const knownSymbolCoingeckoMap = useMemo(() => {
    const map: Record<string, string> = {};
    const assign = (symbol: string, coingeckoId: string | null | undefined) => {
      const normalizedSymbol = symbol.trim().toUpperCase();
      const normalizedId = normalizeCoinGeckoId(coingeckoId);
      if (!normalizedSymbol || !normalizedId || map[normalizedSymbol]) return;
      map[normalizedSymbol] = normalizedId;
    };

    for (const tx of vault.transactions) {
      assign(tx.tokenSymbol, tx.coingeckoId);
    }
    for (const entry of vault.manualEntries) {
      assign(entry.tokenSymbol, entry.coingeckoId);
    }
    for (const target of vault.rebalanceTargets) {
      assign(target.tokenSymbol, target.coingeckoId);
    }

    return map;
  }, [vault.manualEntries, vault.rebalanceTargets, vault.transactions]);

  const groupTargetSymbols = useMemo(
    () =>
      new Set(
        vault.tokenGroups.map((group) => group.name.trim().toUpperCase()).filter(Boolean)
      ),
    [vault.tokenGroups]
  );

  const getSuggestionTradeQuantity = useCallback(
    (suggestion: Suggestion): number | null => {
      if (suggestion.action === "hold" || suggestion.amount <= 0) {
        return null;
      }

      const symbol = suggestion.tokenSymbol.trim().toUpperCase();
      if (groupTargetSymbols.has(symbol)) {
        return null;
      }

      const coingeckoId =
        suggestion.coingeckoId ??
        knownSymbolCoingeckoMap[symbol] ??
        resolveCanonicalCoinGeckoIdBySymbol(symbol);
      if (!coingeckoId) {
        return null;
      }

      const unitPrice = priceMap[coingeckoId]?.usd ?? 0;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return null;
      }

      return suggestion.amount / unitPrice;
    },
    [groupTargetSymbols, knownSymbolCoingeckoMap, priceMap]
  );

  const getRoundedSuggestionTradeQuantity = useCallback(
    (suggestion: Suggestion): number | null => {
      const quantity = getSuggestionTradeQuantity(suggestion);
      if (quantity === null) {
        return null;
      }

      const symbol = suggestion.tokenSymbol.trim().toUpperCase();
      return symbol === "BTC"
        ? Math.round(quantity * 10) / 10
        : Math.round(quantity);
    },
    [getSuggestionTradeQuantity]
  );

  const formatSuggestionTradeQuantity = useCallback(
    (suggestion: Suggestion): string => {
      const roundedQuantity = getRoundedSuggestionTradeQuantity(suggestion);
      if (roundedQuantity === null) {
        return "-";
      }

      const symbol = suggestion.tokenSymbol.trim().toUpperCase();
      return symbol === "BTC"
        ? roundedQuantity.toFixed(1)
        : roundedQuantity.toLocaleString("en-US", {
            maximumFractionDigits: 0,
          });
    },
    [getRoundedSuggestionTradeQuantity]
  );

  const buildTrackableTokens = useCallback(
    (symbols: string[]) => {
      const byCoingeckoId = new Map<string, { coingeckoId: string; symbol: string }>();

      for (const rawSymbol of symbols) {
        const symbol = rawSymbol.trim().toUpperCase();
        if (!symbol) continue;
        const coingeckoId =
          knownSymbolCoingeckoMap[symbol] ??
          resolveCanonicalCoinGeckoIdBySymbol(symbol);
        if (!coingeckoId) continue;
        if (!byCoingeckoId.has(coingeckoId)) {
          byCoingeckoId.set(coingeckoId, { coingeckoId, symbol });
        }
      }

      return Array.from(byCoingeckoId.values());
    },
    [knownSymbolCoingeckoMap]
  );

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

  // ── Computed: autocomplete ────────────────────────────────────

  const groups = useMemo((): TokenGroup[] => {
    return vault.tokenGroups.map((g) => {
      let groupTotal = 0;
      let trackedCount = 0;
      let requestedCount = 0;
      let untrackedCount = 0;
      const members: TokenGroup["members"] = [];

      for (const rawSymbol of g.symbols) {
        const symbol = rawSymbol.trim().toUpperCase();
        if (!symbol) continue;
        const val = symbolValues[symbol] || 0;
        groupTotal += val;

        const coingeckoId =
          knownSymbolCoingeckoMap[symbol] ??
          resolveCanonicalCoinGeckoIdBySymbol(symbol);
        const trackingStatus =
          !coingeckoId
            ? "untracked"
            : priceMap[coingeckoId]
              ? "tracked"
              : "requested";

        if (trackingStatus === "tracked") trackedCount += 1;
        else if (trackingStatus === "requested") requestedCount += 1;
        else untrackedCount += 1;

        members.push({
          symbol,
          valueUsd: val,
          percentInGroup: 0,
          coingeckoId,
          trackingStatus,
        });
      }
      for (const m of members) {
        m.percentInGroup = groupTotal > 0 ? (m.valueUsd / groupTotal) * 100 : 0;
      }

      const totalCount = members.length;
      const status =
        totalCount > 0 && trackedCount === totalCount
          ? "tracked"
          : trackedCount === 0 && requestedCount === 0
            ? "untracked"
            : "partial";

      return {
        id: g.id,
        name: g.name,
        symbols: g.symbols,
        totalValueUsd: groupTotal,
        members,
        tracking: {
          status,
          trackedCount,
          requestedCount,
          untrackedCount,
          totalCount,
        },
      };
    });
  }, [vault.tokenGroups, symbolValues, knownSymbolCoingeckoMap, priceMap]);

  const autocompleteData = useMemo(() => {
    if (activeAutocompleteIndex === null || autocompleteQuery.length === 0) {
      return { suggestions: [] };
    }
    return {
      suggestions: computeAutocompleteSuggestions(
        autocompleteQuery,
        symbolValues,
        groups,
      ),
    };
  }, [activeAutocompleteIndex, autocompleteQuery, symbolValues, groups]);

  // ── Computed: categories ──────────────────────────────────────

  const categories = useMemo((): TokenCategory[] => {
    return vault.tokenCategories.map((c) => ({
      id: c.id,
      tokenSymbol: c.tokenSymbol,
      category: c.category,
    }));
  }, [vault.tokenCategories]);

  const categoryBreakdown = useMemo((): CategoryBreakdown[] => {
    return computeCategoryBreakdown(categories, symbolValues, totalValue);
  }, [categories, symbolValues, totalValue]);

  const tokenSymbolOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const symbol of Object.keys(symbolValues)) {
      const normalized = symbol.trim().toUpperCase();
      if (normalized) unique.add(normalized);
    }
    for (const target of targets) {
      const normalized = target.tokenSymbol.trim().toUpperCase();
      if (normalized) unique.add(normalized);
    }
    for (const category of categories) {
      const normalized = category.tokenSymbol.trim().toUpperCase();
      if (normalized) unique.add(normalized);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [symbolValues, targets, categories]);

  // ── Computed: logs ────────────────────────────────────────────

  const logs = useMemo((): RebalanceLog[] => {
    return vault.rebalanceLogs.map((log) => ({
      id: log.id,
      totalValueUsd: log.totalValueUsd,
      targetsSnapshot: JSON.parse(log.targetsSnapshot || "[]"),
      deviationsSnapshot: JSON.parse(log.deviationsSnapshot || "[]"),
      loggedAt: log.loggedAt,
    }));
  }, [vault.rebalanceLogs]);

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

  // ── Mutations (vault updates) ─────────────────────────────────

  const handleSave = useCallback(() => {
    setSavePending(true);
    setSaveError(null);
    try {
      const validTargets = targets.filter(
        (t) => t.tokenSymbol.trim().length > 0 && t.targetPercent > 0
      );
      const mergedTargets = new Map<string, TargetRow>();
      for (const target of validTargets) {
        const symbol = target.tokenSymbol.trim().toUpperCase();
        const coingeckoId = target.coingeckoId.trim();
        const existing = mergedTargets.get(symbol);
        if (existing) {
          existing.targetPercent =
            Math.round((existing.targetPercent + target.targetPercent) * 100) / 100;
          if (!existing.coingeckoId && coingeckoId.length > 0) {
            existing.coingeckoId = coingeckoId;
          }
        } else {
          mergedTargets.set(symbol, {
            tokenSymbol: symbol,
            targetPercent: Math.round(target.targetPercent * 100) / 100,
            coingeckoId,
          });
        }
      }

      const normalizedTargets = Array.from(mergedTargets.values());
      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        rebalanceTargets: normalizedTargets.map((t) => ({
          id: prev.rebalanceTargets.find(
            (r) => r.tokenSymbol.toUpperCase() === t.tokenSymbol.toUpperCase()
          )?.id || crypto.randomUUID(),
          tokenSymbol: t.tokenSymbol,
          targetPercent: t.targetPercent,
          coingeckoId: t.coingeckoId || null,
          updatedAt: new Date().toISOString(),
        })),
      }));
      toast(t("rebalance.targetsSaved"), "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("rebalance.failedSaveTargets");
      setSaveError(message);
      toast(message, "error");
    } finally {
      setSavePending(false);
    }
  }, [targets, toast, t]);

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

  const ensureGroupSymbolsTracked = useCallback(
    async (symbols: string[]) => {
      const tokensToEnsure = buildTrackableTokens(symbols);
      if (tokensToEnsure.length === 0) return 0;
      await ensurePrices(tokensToEnsure);
      return tokensToEnsure.length;
    },
    [buildTrackableTokens, ensurePrices]
  );

  const handleCreateGroup = useCallback(
    async (data: { name: string; symbols: string[] }) => {
      setGroupCreatePending(true);
      try {
        const normalizedName = data.name.trim();
        const normalizedSymbols = Array.from(
          new Set(data.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))
        );
        if (!normalizedName || normalizedSymbols.length === 0) {
          return;
        }

        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          tokenGroups: [
            ...prev.tokenGroups,
            {
              id: crypto.randomUUID(),
              name: normalizedName,
              symbols: normalizedSymbols,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        try {
          await ensureGroupSymbolsTracked(normalizedSymbols);
        } catch {
          toast(t("rebalance.groupTrackFailed"), "info");
        }
      } finally {
        setGroupCreatePending(false);
      }
    },
    [ensureGroupSymbolsTracked, t, toast]
  );

  const handleUpdateGroup = useCallback(
    async (id: string | number, data: { name: string; symbols: string[] }) => {
      setGroupUpdatePending(true);
      try {
        const normalizedName = data.name.trim();
        const normalizedSymbols = Array.from(
          new Set(data.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))
        );
        if (!normalizedName || normalizedSymbols.length === 0) {
          return;
        }

        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          tokenGroups: prev.tokenGroups.map((group) =>
            String(group.id) === String(id)
              ? {
                  ...group,
                  name: normalizedName,
                  symbols: normalizedSymbols,
                }
              : group
          ),
        }));
        try {
          await ensureGroupSymbolsTracked(normalizedSymbols);
        } catch {
          toast(t("rebalance.groupTrackFailed"), "info");
        }
      } finally {
        setGroupUpdatePending(false);
      }
    },
    [ensureGroupSymbolsTracked, t, toast]
  );

  const handleTrackGroup = useCallback(
    async (id: string | number) => {
      const group = vault.tokenGroups.find(
        (item) => String(item.id) === String(id)
      );
      if (!group) return;

      setGroupTrackPendingId(id);
      try {
        const ensuredCount = await ensureGroupSymbolsTracked(group.symbols);
        if (ensuredCount > 0) {
          toast(t("rebalance.groupTrackRequested", { count: ensuredCount }), "success");
        } else {
          toast(t("rebalance.groupTrackUnavailable"), "info");
        }
      } catch {
        toast(t("rebalance.groupTrackFailed"), "error");
      } finally {
        setGroupTrackPendingId(null);
      }
    },
    [ensureGroupSymbolsTracked, t, toast, vault.tokenGroups]
  );

  const handleDeleteGroup = useCallback(
    (id: string | number) => {
      setGroupDeletePending(true);
      try {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          tokenGroups: prev.tokenGroups.filter((g) => g.id !== id),
        }));
      } finally {
        setGroupDeletePending(false);
      }
    },
    []
  );

  const handleSetCategory = useCallback(
    (data: { tokenSymbol: string; category: string }) => {
      setCategorySetPending(true);
      try {
        useVaultStore.getState().updateVault((prev) => {
          const existing = prev.tokenCategories.findIndex(
            (c) => c.tokenSymbol.toUpperCase() === data.tokenSymbol.toUpperCase()
          );
          const updated = [...prev.tokenCategories];
          if (existing >= 0) {
            updated[existing] = {
              ...updated[existing],
              category: data.category,
              updatedAt: new Date().toISOString(),
            };
          } else {
            updated.push({
              id: crypto.randomUUID(),
              tokenSymbol: data.tokenSymbol.toUpperCase(),
              category: data.category,
              updatedAt: new Date().toISOString(),
            });
          }
          return { ...prev, tokenCategories: updated };
        });
      } finally {
        setCategorySetPending(false);
      }
    },
    []
  );

  const handleDeleteCategory = useCallback(
    (tokenSymbol: string) => {
      setCategoryDeletePending(true);
      try {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          tokenCategories: prev.tokenCategories.filter(
            (c) => c.tokenSymbol.toUpperCase() !== tokenSymbol.toUpperCase()
          ),
        }));
      } finally {
        setCategoryDeletePending(false);
      }
    },
    []
  );

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
  }, [suggestionsData, vault.rebalanceTargets, toast, t]);

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

  const handleAutoGenerate = useCallback(
    (mode: "equal" | "market-cap") => {
      const symbols = Object.entries(symbolValues)
        .filter(([, val]) => val > dustThresholdUsd)
        .sort((a, b) => b[1] - a[1]);

      if (symbols.length === 0) {
        toast(t("rebalance.failedGenerateTargets"), "error");
        return;
      }

      if (mode === "equal") {
        const equalPercent = Math.round((100 / symbols.length) * 100) / 100;
        setTargets(
          symbols.map(([sym]) => ({
            tokenSymbol: sym,
            targetPercent: equalPercent,
            coingeckoId: "",
          }))
        );
      } else {
        setTargets(
          symbols.map(([sym, val]) => ({
            tokenSymbol: sym,
            targetPercent: Math.round((val / totalValue) * 10000) / 100,
            coingeckoId: "",
          }))
        );
      }
      toast(t("rebalance.targetsGenerated"), "success");
    },
    [symbolValues, totalValue, dustThresholdUsd, toast, t]
  );

  // ── Target row handlers ──────────────────────────────────────

  const totalPercent = targets.reduce(
    (s, t) => s + (t.targetPercent || 0),
    0
  );

  const stablecoinQuickAdd = useMemo(() => {
    if (treatStablecoinsAsCashReserve) return null;

    const targetSymbolSet = new Set(
      targets.map((target) => target.tokenSymbol.trim().toUpperCase())
    );

    const candidates = Object.entries(symbolValues)
      .map(([symbol, value]) => ({
        symbol: symbol.toUpperCase(),
        value,
      }))
      .filter(
        (candidate) =>
          candidate.value > dustThresholdUsd &&
          stablecoinSymbols.has(candidate.symbol) &&
          !targetSymbolSet.has(candidate.symbol)
      )
      .sort((a, b) => b.value - a.value);

    const top = candidates[0];
    if (!top || totalValue <= 0) return null;

    const percent = Math.round((top.value / totalValue) * 10000) / 100;
    if (!Number.isFinite(percent) || percent <= 0) return null;

    return {
      symbol: top.symbol,
      percent,
      coingeckoId: strategyContext?.symbolCoingeckoMap[top.symbol] ?? null,
    };
  }, [
    dustThresholdUsd,
    stablecoinSymbols,
    strategyContext,
    symbolValues,
    targets,
    totalValue,
    treatStablecoinsAsCashReserve,
  ]);

  const addTargetFromUntargeted = useCallback((s: Suggestion) => {
    const alreadyExists = targets.some(
      (t) => t.tokenSymbol.toUpperCase() === s.tokenSymbol.toUpperCase()
    );
    if (alreadyExists) return;
    setTargets([
      ...targets,
      {
        tokenSymbol: s.tokenSymbol,
        targetPercent: Math.round(s.currentPercent),
        coingeckoId: s.coingeckoId || "",
      },
    ]);
  }, [targets]);

  const handleAddStablecoinTarget = useCallback(() => {
    if (!stablecoinQuickAdd) return;

    const alreadyExists = targets.some(
      (target) =>
        target.tokenSymbol.trim().toUpperCase() === stablecoinQuickAdd.symbol
    );
    if (alreadyExists) return;

    setTargets([
      ...targets,
      {
        tokenSymbol: stablecoinQuickAdd.symbol,
        targetPercent: stablecoinQuickAdd.percent,
        coingeckoId: stablecoinQuickAdd.coingeckoId || "",
      },
    ]);
  }, [stablecoinQuickAdd, targets]);

  const handleConfirmDelete = useCallback(() => {
    if (!confirmState) return;
    switch (confirmState.type) {
      case "session":
        handleDeleteSession(confirmState.id);
        break;
      case "group":
        handleDeleteGroup(confirmState.id);
        break;
      case "category":
        handleDeleteCategory(confirmState.id as string);
        break;
    }
    setConfirmState(null);
  }, [confirmState, handleDeleteSession, handleDeleteGroup, handleDeleteCategory]);

  const handleExportReport = useCallback(() => {
    try {
      if (!suggestionsData) return;
      const lines: string[] = [
        "REBALANCE REPORT",
        `Date: ${new Date().toISOString().split("T")[0]}`,
        `Total Portfolio: ${formatUsd(suggestionsData.totalValue)}`,
        `Strategy: ${rebalanceStrategy}`,
        "",
        "TOKEN | TARGET | CURRENT | DEVIATION | ACTION | QUANTITY | AMOUNT",
        "------|--------|---------|-----------|--------|----------|-------",
      ];
      for (const s of suggestionsData.targets.filter((s) => !s.isUntargeted)) {
        lines.push(
          `${s.tokenSymbol} | ${s.targetPercent.toFixed(1)}% | ${s.currentPercent.toFixed(1)}% | ${s.deviation >= 0 ? "+" : ""}${s.deviation.toFixed(1)}% | ${s.action} | ${formatSuggestionTradeQuantity(s)} | ${s.action !== "hold" ? formatUsd(s.amount) : "-"}`
        );
      }
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rebalance_report_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t("rebalance.reportExported"), "success");
    } catch {
      toast(t("rebalance.exportFailed"), "error");
    }
  }, [formatSuggestionTradeQuantity, suggestionsData, rebalanceStrategy, toast, t]);

  const handleExportCsv = useCallback(() => {
    try {
      if (!suggestionsData) return;
      const headers = ["Token", "Target%", "Current%", "Deviation%", "Action", "Quantity", "Amount"];
      const rows = suggestionsData.targets
        .filter((s) => !s.isUntargeted)
        .map((s) => {
          const roundedQuantity = getRoundedSuggestionTradeQuantity(s);
          const symbol = s.tokenSymbol.trim().toUpperCase();
          return [
            s.tokenSymbol,
            s.targetPercent.toFixed(1),
            s.currentPercent.toFixed(1),
            s.deviation.toFixed(1),
            s.action,
            roundedQuantity !== null
              ? symbol === "BTC"
                ? roundedQuantity.toFixed(1)
                : roundedQuantity.toFixed(0)
              : "",
            s.action !== "hold" ? s.amount.toFixed(2) : "0",
          ].join(",");
        });
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rebalance_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t("rebalance.csvExported"), "success");
    } catch {
      toast(t("rebalance.exportFailed"), "error");
    }
  }, [getRoundedSuggestionTradeQuantity, suggestionsData, toast, t]);

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
  const targetedSymbolsUpper = useMemo(
    () =>
      new Set(targets.map((target) => target.tokenSymbol.trim().toUpperCase())),
    [targets]
  );

  const suggestionsLoading = pricesLoading;

  const isPriceStale = useMemo(() => {
    const oldest = suggestionsData?.oldestPriceUpdate;
    if (!oldest) return false;
    return Date.now() - new Date(oldest).getTime() > 60 * 1000;
  }, [suggestionsData?.oldestPriceUpdate]);

  const activeSessions = allSessions.filter(
    (s) => s.status === "in_progress"
  );
  const pastSessions = allSessions.filter(
    (s) => s.status !== "in_progress"
  ).slice(0, 10);

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

  useEffect(() => {
    if (phaseInitialized) return;

    if (activeSessions.length > 0) {
      setActivePhase("execution");
      setPhaseInitialized(true);
      return;
    }

    if (targetedSuggestions.length > 0 || allAlerts.length > 0) {
      setActivePhase("analysis");
      setPhaseInitialized(true);
      return;
    }

    if (
      targets.length > 0 ||
      untargetedSuggestions.length > 0 ||
      groups.length > 0 ||
      categories.length > 0
    ) {
      setPhaseInitialized(true);
    }
  }, [
    activeSessions.length,
    allAlerts.length,
    categories.length,
    groups.length,
    phaseInitialized,
    targetedSuggestions.length,
    targets.length,
    untargetedSuggestions.length,
  ]);

  const showSetupPhase = activePhase === "all" || activePhase === "setup";
  const showAnalysisPhase = activePhase === "all" || activePhase === "analysis";
  const showExecutionPhase = activePhase === "all" || activePhase === "execution";

  const setupPhaseCount =
    targets.length +
    untargetedSuggestions.length +
    groups.length +
    categories.length;
  const analysisPhaseCount =
    targetedSuggestions.length +
    allAlerts.length +
    (suggestionsData?.dcaChunks?.length ?? 0) +
    logs.length;
  const executionPhaseCount =
    (suggestionsData?.executionSteps?.length ?? 0) +
    activeSessions.length +
    pastSessions.length;
  const phaseOptions = useMemo(
    () => [
      {
        value: "setup" as const,
        label: t("rebalance.phaseSetup"),
        count: setupPhaseCount,
      },
      {
        value: "analysis" as const,
        label: t("rebalance.phaseAnalysis"),
        count: analysisPhaseCount,
      },
      {
        value: "execution" as const,
        label: t("rebalance.phaseExecution"),
        count: executionPhaseCount,
      },
      {
        value: "all" as const,
        label: t("rebalance.viewAll"),
        count: setupPhaseCount + analysisPhaseCount + executionPhaseCount,
      },
    ],
    [
      analysisPhaseCount,
      executionPhaseCount,
      setupPhaseCount,
      t,
    ]
  );

  return {
    // State
    targets, setTargets,
    targetExpanded,
    activePhase, setActivePhase,
    phaseInitialized, setPhaseInitialized,
    recordingSessionId,
    recordingTrades,
    confirmState, setConfirmState,
    activeAutocompleteIndex, setActiveAutocompleteIndex,
    autocompleteQuery, setAutocompleteQuery,

    // Pending states
    savePending, saveError,
    logPending,
    groupCreatePending, groupUpdatePending, groupDeletePending,
    groupTrackPendingId,
    categorySetPending, categoryDeletePending,
    startSessionPending, completeSessionPending, deleteSessionPending,
    recordTransactionsPending,

    // Computed
    vault,
    pricesLoading,
    suggestionsData,
    alertsData,
    allAlerts,
    deviationAlerts,
    concentrationAlerts,
    hasConcentrationRisk,
    concentrationThresholdLabel,
    holdZonePercent,
    rebalanceStrategy,
    totalPercent,
    stablecoinQuickAdd,
    groups,
    autocompleteData,
    categories,
    categoryBreakdown,
    tokenSymbolOptions,
    logs,
    allSessions,
    targetedSuggestions,
    targetedSuggestionsSorted,
    actionableSuggestions,
    hasActionableSuggestions,
    maxDeviation,
    totalSuggestedVolume,
    untargetedSuggestions,
    targetedSymbolsUpper,
    suggestionsLoading,
    isPriceStale,
    activeSessions,
    pastSessions,
    chartData,
    targetVsCurrentChartSummary,
    showSetupPhase,
    showAnalysisPhase,
    showExecutionPhase,
    phaseOptions,

    // Handlers
    handleToggleTargetExpanded,
    handleSave,
    handleLogSnapshot,
    handleCreateGroup,
    handleUpdateGroup,
    handleTrackGroup,
    handleDeleteGroup,
    handleSetCategory,
    handleDeleteCategory,
    handleStartSession,
    handleToggleTrade,
    handleCompleteSession,
    handleDeleteSession,
    handleStartRecordingSession,
    handleUpdateRecordingTrade,
    handleSaveRecordedTrades,
    handleCancelRecordingSession,
    handleAutoGenerate,
    handleAddStablecoinTarget,
    addTargetFromUntargeted,
    handleConfirmDelete,
    handleExportReport,
    handleExportCsv,
    formatSuggestionTradeQuantity,
  };
}
