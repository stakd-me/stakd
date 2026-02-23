"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd, formatTimeAgo } from "@/lib/utils";
import {
  Plus,
  AlertTriangle,
  ShieldAlert,
  Clock,
  ChevronDown,
  ChevronUp,
  Play,
  CheckCircle2,
  XCircle,
  Download,
  RefreshCw,
  Activity,
  FileText,
} from "lucide-react";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, ChartTooltip, ChartLegend);
import { Skeleton, CardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslation } from "@/hooks/use-translation";
import { useChartTheme } from "@/hooks/use-chart-theme";
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
} from "@/lib/services/rebalance-strategies";
import type { StrategyOutput } from "@/lib/services/rebalance-strategies";
import { getSymbolValues } from "@/lib/services/portfolio-calculator";
import { getOldestPriceUpdateForTokens } from "@/lib/pricing/freshness";
import type { RebalanceStrategy } from "@/components/rebalance/types";

import type {
  TargetRow,
  Suggestion,
  SuggestionsData,
  Alert,
  AutocompleteSuggestion,
  TokenGroup,
  RebalanceSession,
  TokenCategory,
  CategoryBreakdown,
  RebalanceLog,
  ConfirmState,
} from "@/components/rebalance/types";
import {
  getDeviationColor,
  getDeviationBg,
  getActionBadge,
  getSeverityBadge,
  getAlertTypeLabel,
} from "@/components/rebalance/helpers";
import { TargetAllocationSection } from "@/components/rebalance/target-allocation-section";
import { TokenGroupsSection } from "@/components/rebalance/token-groups-section";
import { AssetCategoriesSection } from "@/components/rebalance/asset-categories-section";
import { WhatIfCalculatorSection } from "@/components/rebalance/what-if-calculator-section";
import { PastSessionsSection } from "@/components/rebalance/past-sessions-section";

// ── Helper: compute execution steps from suggestions ──────────────

function computeExecutionSteps(
  suggestions: Suggestion[],
): SuggestionsData["executionSteps"] {
  const actionable = suggestions.filter((s) => s.action !== "hold");
  if (actionable.length === 0) return [];

  // Sells first, then buys
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
    const currentValue = symbolValues[symbol] || 0;
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

    // Concentration alert: any token above configured threshold
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

  // Add matching symbols from portfolio
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

  // Add matching groups
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

const TARGET_EXPANDED_STORAGE_KEY = "rebalance:target-allocation-expanded";

// ── Page Component ──────────────────────────────────────────────

export default function RebalancePage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const chartTheme = useChartTheme();
  const [refreshingPrices, setRefreshingPrices] = useState(false);
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

  // Post-execution recording flow
  const [recordingSessionId, setRecordingSessionId] = useState<string | number | null>(null);
  const [recordingTrades, setRecordingTrades] = useState<{
    tokenSymbol: string;
    action: string;
    amountUsd: number;
    quantity: string;
  }[]>([]);

  // Delete confirmation
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // Rebalance history expand
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Mutation pending states
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logPending, setLogPending] = useState(false);
  const [groupCreatePending, setGroupCreatePending] = useState(false);
  const [groupDeletePending, setGroupDeletePending] = useState(false);
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
    refreshPrices,
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

  // Strategy computation
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

  // Build full SuggestionsData from strategy output
  const suggestionsData = useMemo((): SuggestionsData | undefined => {
    if (!strategyOutput) return undefined;

    const allSuggestions: Suggestion[] = [...strategyOutput.suggestions];

    // Add untargeted tokens (tokens in portfolio but not in targets)
    const targetSymbols = new Set(
      vault.rebalanceTargets.map((t) => t.tokenSymbol.toUpperCase())
    );
    for (const [symbol, value] of Object.entries(symbolValues)) {
      if (
        treatStablecoinsAsCashReserve &&
        stablecoinSymbols.has(symbol.toUpperCase())
      ) {
        continue;
      }
      if (value > dustThresholdUsd && !targetSymbols.has(symbol)) {
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

    // Price freshness should reflect only tokens used in the current rebalance context.
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

  const alertsError = false;

  // ── Computed: autocomplete ────────────────────────────────────

  const groups = useMemo((): TokenGroup[] => {
    return vault.tokenGroups.map((g) => {
      let groupTotal = 0;
      const members: TokenGroup["members"] = [];
      for (const s of g.symbols) {
        const val = symbolValues[s.toUpperCase()] || 0;
        groupTotal += val;
        members.push({ symbol: s.toUpperCase(), valueUsd: val, percentInGroup: 0 });
      }
      // Fill in percentInGroup
      for (const m of members) {
        m.percentInGroup = groupTotal > 0 ? (m.valueUsd / groupTotal) * 100 : 0;
      }
      return {
        id: g.id,
        name: g.name,
        symbols: g.symbols,
        totalValueUsd: groupTotal,
        members,
      };
    });
  }, [vault.tokenGroups, symbolValues]);

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
        const val = symbolValues[sym] || 0;
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
  }, [vault.rebalanceTargets, symbolValues, totalValue, toast, t]);

  const handleRefreshPrices = useCallback(async () => {
    setRefreshingPrices(true);
    try {
      await refreshPrices();
      toast(t("dashboard.pricesRefreshed"), "success");
    } catch {
      toast(t("dashboard.failedToRefresh"), "error");
    } finally {
      setRefreshingPrices(false);
    }
  }, [refreshPrices, toast, t]);

  const handleCreateGroup = useCallback(
    (data: { name: string; symbols: string[] }) => {
      setGroupCreatePending(true);
      try {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          tokenGroups: [
            ...prev.tokenGroups,
            {
              id: crypto.randomUUID(),
              name: data.name,
              symbols: data.symbols,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
      } finally {
        setGroupCreatePending(false);
      }
    },
    []
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
          // If completing, update lastRebalanceDate
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
    async (trades: { tokenSymbol: string; action: string; amountUsd: number; quantity: string }[]) => {
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

  // ── Auto-generate handler ──────────────────────────────────
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
        // market-cap (current allocation)
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

  const addTargetFromUntargeted = (s: Suggestion) => {
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
  };

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

  // ── Confirm delete dispatch ─────────────────────────────────
  const handleConfirmDelete = () => {
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
  };

  // ── Export handlers ──────────────────────────────────────────
  const handleExportReport = useCallback(() => {
    try {
      if (!suggestionsData) return;
      const lines: string[] = [
        "REBALANCE REPORT",
        `Date: ${new Date().toISOString().split("T")[0]}`,
        `Total Portfolio: ${formatUsd(suggestionsData.totalValue)}`,
        `Strategy: ${rebalanceStrategy}`,
        "",
        "TOKEN | TARGET | CURRENT | DEVIATION | ACTION | AMOUNT",
        "------|--------|---------|-----------|--------|-------",
      ];
      for (const s of suggestionsData.targets.filter((s) => !s.isUntargeted)) {
        lines.push(
          `${s.tokenSymbol} | ${s.targetPercent.toFixed(1)}% | ${s.currentPercent.toFixed(1)}% | ${s.deviation >= 0 ? "+" : ""}${s.deviation.toFixed(1)}% | ${s.action} | ${s.action !== "hold" ? formatUsd(s.amount) : "-"}`
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
  }, [suggestionsData, rebalanceStrategy, toast, t]);

  const handleExportCsv = useCallback(() => {
    try {
      if (!suggestionsData) return;
      const headers = ["Token", "Target%", "Current%", "Deviation%", "Action", "Amount"];
      const rows = suggestionsData.targets
        .filter((s) => !s.isUntargeted)
        .map((s) =>
          [
            s.tokenSymbol,
            s.targetPercent.toFixed(1),
            s.currentPercent.toFixed(1),
            s.deviation.toFixed(1),
            s.action,
            s.action !== "hold" ? s.amount.toFixed(2) : "0",
          ].join(",")
        );
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
  }, [suggestionsData, toast, t]);

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

  // ── Loading / error states ───────────────────────────────────

  if (pricesLoading && vault.rebalanceTargets.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("rebalance.title")}</h1>
          <p className="text-text-subtle">
            {t("rebalance.subtitle")}
          </p>
        </div>
        <CardSkeleton />
        <div className="rounded-lg border border-border bg-bg-card p-6">
          <Skeleton className="mb-4 h-5 w-40" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Header + Log Snapshot ─────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("rebalance.title")}</h1>
          <p className="text-text-subtle">
            {t("rebalance.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshPrices}
            disabled={refreshingPrices}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshingPrices ? "animate-spin" : ""}`} />
            {t("dashboard.refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogSnapshot}
            disabled={logPending}
            title={t("rebalance.snapshotTooltip")}
          >
            <Clock className="mr-2 h-4 w-4" />
            {logPending ? t("rebalance.logging") : t("rebalance.logSnapshot")}
          </Button>
        </div>
      </div>

      {/* ── 2. Info Bar ──────────────────────────────────────── */}
      {suggestionsData && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-subtle">
          {suggestionsData?.buyOnlyMode && (
            <span className="rounded-full bg-status-info-soft px-2.5 py-0.5 text-xs font-medium text-status-info border border-status-info-border">
              {t("rebalance.buyOnlyMode")}
            </span>
          )}
          {suggestionsData?.rebalanceStrategy && suggestionsData.rebalanceStrategy !== "threshold" && (
            <span className="rounded-full border border-status-info-border bg-status-info-soft px-2.5 py-0.5 text-xs font-medium text-status-info">
              {suggestionsData.rebalanceStrategy === "calendar" && t("rebalance.strategyCalendar")}
              {suggestionsData.rebalanceStrategy === "percent-of-portfolio" && t("rebalance.strategyPercentOfPortfolio")}
              {suggestionsData.rebalanceStrategy === "risk-parity" && t("rebalance.strategyRiskParity")}
              {suggestionsData.rebalanceStrategy === "dca-weighted" && t("rebalance.strategyDcaWeighted")}
            </span>
          )}
          {suggestionsData.lastRebalanceTime && (
            <span>{t("rebalance.lastRebalance")}: {formatTimeAgo(new Date(suggestionsData.lastRebalanceTime))}</span>
          )}
          {suggestionsData.oldestPriceUpdate && (() => {
            const ageMs = Date.now() - new Date(suggestionsData.oldestPriceUpdate).getTime();
            const isStale = ageMs > 30 * 60 * 1000;
            return isStale ? (
              <span className="rounded-full bg-status-warning-soft px-2.5 py-0.5 text-xs font-medium text-status-warning border border-status-warning-border">
                {t("rebalance.prices")}: {formatTimeAgo(new Date(suggestionsData.oldestPriceUpdate))}
              </span>
            ) : (
              <span className="text-text-dim">
                {t("rebalance.prices")}: {formatTimeAgo(new Date(suggestionsData.oldestPriceUpdate))}
              </span>
            );
          })()}
          {(suggestionsData.autoRefreshMinutes ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-positive-soft px-2.5 py-0.5 text-xs font-medium text-status-positive border border-status-positive-border">
              <RefreshCw className="h-3 w-3" />
              {t("rebalance.autoRefresh")}: {t("rebalance.every")} {suggestionsData.autoRefreshMinutes}m
            </span>
          )}
          <span className="text-text-dim">({t("rebalance.configureInSettings")})</span>
        </div>
      )}

      {suggestionsData && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-text-subtle">{t("rebalance.totalTrades")}</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{actionableSuggestions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-text-subtle">{t("rebalance.portfolioDrift")}</p>
              <p className={`mt-1 text-2xl font-bold ${maxDeviation <= holdZonePercent ? "text-status-positive" : maxDeviation <= holdZonePercent * 2 ? "text-status-warning" : "text-status-negative"}`}>
                {maxDeviation.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-text-subtle">{t("rebalance.totalVolume")}</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{formatUsd(totalSuggestedVolume)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 3. Target Allocation ─────────────────────────────── */}
      <TargetAllocationSection
        targets={targets}
        setTargets={setTargets}
        totalPercent={totalPercent}
        expanded={targetExpanded}
        onToggleExpanded={handleToggleTargetExpanded}
        stablecoinQuickAdd={stablecoinQuickAdd}
        onAddStablecoinTarget={handleAddStablecoinTarget}
        suggestionsData={suggestionsData}
        groups={groups}
        autocompleteData={autocompleteData}
        activeAutocompleteIndex={activeAutocompleteIndex}
        setActiveAutocompleteIndex={setActiveAutocompleteIndex}
        autocompleteQuery={autocompleteQuery}
        setAutocompleteQuery={setAutocompleteQuery}
        onSave={handleSave}
        savePending={savePending}
        saveError={saveError !== null}
        saveErrorMessage={saveError ?? undefined}
        onAutoGenerate={handleAutoGenerate}
      />

      {/* ── Calendar-Blocked Notice ─────────────────────────── */}
      {suggestionsData?.calendarBlocked && (
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-3 text-status-warning">
              <Clock className="h-6 w-6" />
              <div>
                <p className="font-medium">{t("rebalance.waitingForNext")}</p>
                <p className="text-sm text-text-subtle">
                  {t("rebalance.calendarActive")}{" "}
                  <span className="font-medium text-text-primary">
                    {suggestionsData.nextRebalanceDate || t("rebalance.notSet")}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Risk-Parity Targets Info ──────────────────────────── */}
      {suggestionsData?.riskParityTargets && suggestionsData.riskParityTargets.length > 0 && (() => {
        const usesFallback = suggestionsData.riskParityTargets.some(
          (target) => !target.hasVolatilityData
        );
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-status-info">
                {t("rebalance.riskParityTargets")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-text-subtle">
                {t("rebalance.riskParityDescription")}
              </p>
              {usesFallback && (
                <p className="mb-3 rounded-md border border-status-warning-border bg-status-warning-soft px-3 py-2 text-xs text-status-warning">
                  {t("rebalance.riskParityFallback")}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-subtle">
                      <th className="pb-2 pr-4">{t("rebalance.token")}</th>
                      <th className="pb-2 pr-4 text-right">{t("rebalance.volatility")}</th>
                      <th className="pb-2 text-right">{t("rebalance.computedTarget")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestionsData.riskParityTargets.map((rpt) => (
                      <tr key={rpt.tokenSymbol} className="border-b border-border-subtle">
                        <td className="py-2 pr-4 font-medium text-text-primary">{rpt.tokenSymbol}</td>
                        <td className="py-2 pr-4 text-right text-text-muted">
                          {rpt.hasVolatilityData
                            ? `${rpt.volatility.toFixed(1)}%`
                            : t("rebalance.volatilityUnavailable")}
                        </td>
                        <td className="py-2 text-right font-medium text-status-info">
                          {rpt.computedTargetPercent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── 3. Alerts (moved near top) ───────────────────────── */}
      {allAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-status-warning" />
              {t("rebalance.alerts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertsError ? (
              <ErrorState
                message={t("rebalance.failedLoadAlerts")}
                onRetry={() => {}}
              />
            ) : (
              <div className="space-y-2">
                {concentrationAlerts.length > 0 && (
                  <div className="mb-4">
                    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-status-negative">
                      <ShieldAlert className="h-4 w-4" />
                      {t("rebalance.concentrationRisk")} ({concentrationThresholdLabel}%)
                    </h4>
                    {concentrationAlerts.map((alert, i) => (
                      <div
                        key={`conc-${i}`}
                        className="mb-2 flex items-center justify-between rounded-md bg-status-negative-soft px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="inline-block rounded-full border border-status-negative-border bg-status-negative-soft px-2 py-0.5 text-xs font-medium uppercase text-status-negative">
                            {alert.severity}
                          </span>
                          <span className="font-medium text-text-primary">
                            {alert.tokenSymbol}
                          </span>
                          <span className="text-xs text-text-subtle">
                            ({getAlertTypeLabel(alert.type)})
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium text-status-negative">
                            {alert.currentPercent.toFixed(1)}% {t("rebalance.ofPortfolio")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {deviationAlerts.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-status-warning">
                      {t("rebalance.deviationAlerts")}
                    </h4>
                    {deviationAlerts.map((alert) => (
                      <div
                        key={alert.tokenSymbol}
                        className="mb-2 flex items-center justify-between rounded-md bg-bg-card px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${getSeverityBadge(alert.severity)}`}
                          >
                            {alert.severity}
                          </span>
                          <span className="font-medium text-text-primary">
                            {alert.tokenSymbol}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-text-subtle">
                            {t("rebalance.targetLabel")}: {alert.targetPercent.toFixed(1)}%
                          </span>
                          <span className="text-text-subtle">
                            {t("rebalance.currentLabel")}: {alert.currentPercent.toFixed(1)}%
                          </span>
                          <span
                            className={`font-medium ${getDeviationColor(alert.deviation)}`}
                          >
                            {alert.deviation >= 0 ? "+" : ""}
                            {alert.deviation.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 4. Well-Balanced / Rebalance Summary ─────────────── */}
      {suggestionsData?.summary?.isWellBalanced && (
        <Card>
          <CardContent className="py-6">
            <div
              className={`flex items-center gap-3 ${
                hasConcentrationRisk
                  ? "text-status-warning"
                  : "text-status-positive"
              }`}
            >
              {hasConcentrationRisk ? (
                <ShieldAlert className="h-6 w-6" />
              ) : (
                <CheckCircle2 className="h-6 w-6" />
              )}
              <div>
                <p className="font-medium">
                  {hasConcentrationRisk
                    ? t("rebalance.onTargetButConcentration")
                    : t("rebalance.wellBalanced")}
                </p>
                <p className="text-sm text-text-subtle">
                  {hasConcentrationRisk
                    ? t("rebalance.concentrationThresholdExceeded", {
                        threshold: concentrationThresholdLabel,
                      })
                    : t("rebalance.portfolioDriftBelow", {
                        drift: suggestionsData.summary.portfolioDrift.toFixed(1),
                        threshold: suggestionsData.summary.driftThresholdPercent,
                      })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {suggestionsData?.summary && !suggestionsData.summary.isWellBalanced && targetedSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {t("rebalance.summary")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              <div className="rounded-md bg-bg-card px-3 py-2 text-center">
                <p className="text-xs text-text-subtle">{t("rebalance.totalTrades")}</p>
                <p className="text-lg font-bold text-text-primary">{suggestionsData.summary.tradeCount}</p>
                <p className="text-xs text-text-dim">{suggestionsData.summary.sellCount} {t("rebalance.sells")}, {suggestionsData.summary.buyCount} {t("rebalance.buys")}</p>
              </div>
              <div className="rounded-md bg-bg-card px-3 py-2 text-center">
                <p className="text-xs text-text-subtle">{t("rebalance.totalVolume")}</p>
                <p className="text-lg font-bold text-text-primary">{formatUsd(suggestionsData.summary.totalVolume)}</p>
              </div>
              <div className="rounded-md bg-bg-card px-3 py-2 text-center">
                <p className="text-xs text-text-subtle">{t("rebalance.estFees")}</p>
                <p className="text-lg font-bold text-text-primary">{formatUsd(suggestionsData.summary.totalEstimatedFees)}</p>
              </div>
              <div className="rounded-md bg-bg-card px-3 py-2 text-center">
                <p className="text-xs text-text-subtle">{t("rebalance.portfolioDrift")}</p>
                <p className={`text-lg font-bold ${
                  suggestionsData.summary.portfolioDrift < 5
                    ? "text-status-positive"
                    : suggestionsData.summary.portfolioDrift < 10
                      ? "text-status-warning"
                      : "text-status-negative"
                }`}>
                  {suggestionsData.summary.portfolioDrift.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-md bg-bg-card px-3 py-2 text-center">
                <p className="text-xs text-text-subtle">{t("rebalance.efficiency")}</p>
                <p className={`text-lg font-bold ${
                  suggestionsData.summary.portfolioEfficiency >= 95
                    ? "text-status-positive"
                    : suggestionsData.summary.portfolioEfficiency >= 90
                      ? "text-status-warning"
                      : "text-status-negative"
                }`}>
                  {suggestionsData.summary.portfolioEfficiency.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 5. Chart ─────────────────────────────────────────── */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("rebalance.targetVsCurrent")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
                <Bar
                  data={{
                    labels: chartData.map((d) => d.name),
                    datasets: [
                      {
                        label: t("rebalance.targetLabel"),
                        data: chartData.map((d) => d.Target),
                        backgroundColor: "#3b82f6",
                        borderRadius: 4,
                      },
                      {
                        label: t("rebalance.currentLabel"),
                        data: chartData.map((d) => d.Current),
                        backgroundColor: "#8b5cf6",
                        borderRadius: 4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        labels: { color: chartTheme.tickColor },
                      },
                      tooltip: {
                        backgroundColor: chartTheme.tooltipBg,
                        titleColor: chartTheme.tooltipText,
                        bodyColor: chartTheme.tooltipText,
                        borderColor: chartTheme.tooltipBorder,
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                          label: (item) =>
                            `${item.dataset.label}: ${(item.raw as number).toFixed(1)}%`,
                        },
                      },
                    },
                    scales: {
                      x: {
                        grid: { color: chartTheme.gridColor },
                        ticks: { color: chartTheme.tickColor, font: { size: 12 } },
                      },
                      y: {
                        grid: { color: chartTheme.gridColor },
                        ticks: {
                          color: chartTheme.tickColor,
                          font: { size: 12 },
                          callback: (value) => `${value}%`,
                        },
                      },
                    },
                  }}
                />
              </div>
          </CardContent>
        </Card>
      )}

      {/* ── 6. Current vs Target Table ───────────────────────── */}
      {suggestionsData && targetedSuggestions.length > 0 && !suggestionsData.summary?.isWellBalanced && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>{t("rebalance.currentVsTarget")}</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportReport}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {t("rebalance.exportReport")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t("rebalance.exportCsv")}
                </Button>
                <span className="text-sm text-text-subtle">
                  {t("rebalance.totalPortfolio")}: {formatUsd(suggestionsData.totalValue)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {suggestionsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-subtle">
                      <th className="pb-3 pr-4">{t("rebalance.token")}</th>
                      <th className="pb-3 pr-4 text-right">{t("rebalance.targetPercent")}</th>
                      <th className="pb-3 pr-4 text-right">{t("rebalance.currentPercent")}</th>
                      <th className="pb-3 pr-4 text-right">{t("rebalance.deviation")}</th>
                      <th className="pb-3 pr-4 text-right">{t("rebalance.currentValue")}</th>
                      <th className="pb-3 pr-4 text-center">{t("rebalance.action")}</th>
                      <th className="pb-3 text-right">{t("rebalance.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetedSuggestionsSorted.map((s) => (
                      <tr
                        key={s.tokenSymbol}
                        className={`border-b border-border-subtle ${getDeviationBg(s.deviation)}`}
                      >
                        <td className="py-3 pr-4 font-medium text-text-primary">
                          {s.tokenSymbol}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {s.targetPercent.toFixed(1)}%
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {s.currentPercent.toFixed(1)}%
                        </td>
                        <td
                          className={`py-3 pr-4 text-right font-medium ${getDeviationColor(s.deviation)}`}
                        >
                          {s.deviation >= 0 ? "+" : ""}
                          {s.deviation.toFixed(1)}%
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {formatUsd(s.currentValue)}
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${getActionBadge(s.action)}`}
                          >
                            {s.action}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {s.action !== "hold" ? formatUsd(s.amount) : "-"}
                          {s.action !== "hold" && (s.estimatedSlippage > 0 || s.estimatedFee > 0) && (
                            <div className="text-xs text-text-dim mt-0.5">
                              {t("rebalance.fees")}: {formatUsd(s.estimatedFee)} | {t("rebalance.slip")}: {formatUsd(s.estimatedSlippage)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 7. Execution Plan ────────────────────────────────── */}
      {suggestionsData?.executionSteps && suggestionsData.executionSteps.length > 0 && !suggestionsData.summary?.isWellBalanced && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              {t("rebalance.executionPlan")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-text-subtle">
              {t("rebalance.executionPlanDescription")}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-subtle">
                    <th className="pb-3 pr-4">{t("rebalance.step")}</th>
                    <th className="pb-3 pr-4">{t("rebalance.action")}</th>
                    <th className="pb-3 pr-4">{t("rebalance.token")}</th>
                    <th className="pb-3 pr-4 text-right">{t("rebalance.amount")}</th>
                    <th className="pb-3 pr-4 text-right">{t("rebalance.feesSlip")}</th>
                    <th className="pb-3 text-right">{t("rebalance.cashAfter")}</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestionsData.executionSteps.map((step) => (
                    <tr key={step.step} className="border-b border-border-subtle">
                      <td className="py-3 pr-4 text-text-subtle">#{step.step}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${getActionBadge(step.action)}`}>
                          {step.action}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-medium text-text-primary">{step.tokenSymbol}</td>
                      <td className="py-3 pr-4 text-right">{formatUsd(step.amount)}</td>
                      <td className="py-3 pr-4 text-right text-text-subtle">
                        {formatUsd(step.estimatedSlippage + step.estimatedFee)}
                      </td>
                      <td className={`py-3 text-right font-medium ${step.runningCashAfter >= 0 ? "text-status-positive" : "text-status-negative"}`}>
                        {formatUsd(step.runningCashAfter)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── DCA Schedule ─────────────────────────────────────── */}
      {suggestionsData?.dcaChunks && suggestionsData.dcaChunks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-status-info" />
              {t("rebalance.dcaSchedule")} ({suggestionsData.dcaTotalChunks} {t("rebalance.chunks")}, {t("rebalance.every")} {suggestionsData.dcaIntervalDays} {t("rebalance.days")})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-text-subtle">
              {t("rebalance.dcaDescription", { chunks: suggestionsData.dcaTotalChunks ?? 0 })}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-subtle">
                    <th className="pb-2 pr-4">{t("rebalance.chunk")}</th>
                    <th className="pb-2 pr-4">{t("rebalance.date")}</th>
                    <th className="pb-2">{t("rebalance.tradesLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestionsData.dcaChunks.map((chunk) => (
                    <tr key={chunk.chunkIndex} className="border-b border-border-subtle">
                      <td className="py-2 pr-4 text-text-muted">#{chunk.chunkIndex}</td>
                      <td className="py-2 pr-4 text-text-primary">{chunk.scheduledDate}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {chunk.trades.map((trade) => (
                            <span
                              key={trade.tokenSymbol}
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                                trade.action === "buy"
                                  ? "bg-status-positive-soft text-status-positive"
                                  : "bg-status-negative-soft text-status-negative"
                              }`}
                            >
                              {trade.action.toUpperCase()} {trade.tokenSymbol} {formatUsd(trade.amount)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 8. Start Execution / Active Sessions ─────────────── */}
      {hasActionableSuggestions && activeSessions.length === 0 && !suggestionsData?.summary?.isWellBalanced && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm text-text-subtle">
              {t("rebalance.readyToExecute")}
            </p>
            <Button
              size="sm"
              onClick={handleStartSession}
              disabled={startSessionPending}
            >
              <Play className="mr-2 h-4 w-4" />
              {startSessionPending ? t("rebalance.starting") : t("rebalance.startExecution")}
            </Button>
          </CardContent>
        </Card>
      )}

      {activeSessions.map((session) => {
        const completedCount = session.trades.filter((t) => t.status === "completed").length;
        const progress = session.trades.length > 0 ? (completedCount / session.trades.length) * 100 : 0;
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
                        onClick={() => handleToggleTrade(session.id, trade.id)}
                        className="text-text-subtle hover:text-text-primary"
                        aria-label={`Toggle ${trade.tokenSymbol} trade as ${trade.status === "completed" ? "pending" : "completed"}`}
                      >
                        {trade.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-status-positive" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-border" />
                        )}
                      </button>
                      <span className={trade.status === "completed" ? "text-text-dim line-through" : "text-text-primary"}>
                        {trade.action.toUpperCase()} {trade.tokenSymbol}
                      </span>
                    </div>
                    <span className="text-sm text-text-subtle">
                      {formatUsd(trade.amountUsd)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleCompleteSession({ id: session.id, status: "completed" })}
                  disabled={completeSessionPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t("rebalance.complete")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCompleteSession({ id: session.id, status: "cancelled" })}
                  disabled={completeSessionPending}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  {t("rebalance.cancel")}
                </Button>
              </div>

              {session.trades.every((t) => t.status === "completed") &&
                recordingSessionId !== session.id && (
                  <div className="mt-4 rounded-md border border-status-info-border bg-status-info-soft p-3">
                    <p className="text-sm text-status-info">
                      {t("rebalance.allTradesCompleted")}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setRecordingSessionId(session.id);
                          setRecordingTrades(
                            session.trades.map((t) => ({
                              tokenSymbol: t.tokenSymbol,
                              action: t.action,
                              amountUsd: t.amountUsd,
                              quantity: "",
                            }))
                          );
                        }}
                      >
                        {t("rebalance.recordTransactions")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleCompleteSession({
                            id: session.id,
                            status: "completed",
                          })
                        }
                      >
                        {t("rebalance.skip")}
                      </Button>
                    </div>
                  </div>
                )}

              {recordingSessionId === session.id && (
                <div className="mt-4 space-y-3 rounded-md border border-border bg-bg-card p-3">
                  <h5 className="text-sm font-medium text-text-muted">
                    {t("rebalance.recordExecutedTrades")}
                  </h5>
                  <p className="text-xs text-text-dim">
                    {t("rebalance.enterQuantities")}
                  </p>
                  {recordingTrades.map((trade, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
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
                        onChange={(e) => {
                          const updated = [...recordingTrades];
                          updated[idx] = { ...updated[idx], quantity: e.target.value };
                          setRecordingTrades(updated);
                        }}
                        className="w-full sm:w-32"
                        min={0}
                        step="any"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        handleRecordTransactions(recordingTrades);
                      }}
                      disabled={
                        recordTransactionsPending ||
                        recordingTrades.every((t) => !t.quantity || parseFloat(t.quantity) <= 0)
                      }
                    >
                      {recordTransactionsPending ? t("rebalance.recording") : t("rebalance.saveAllTransactions")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRecordingSessionId(null);
                        setRecordingTrades([]);
                        handleCompleteSession({
                          id: session.id,
                          status: "completed",
                        });
                      }}
                    >
                      {t("rebalance.cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* ── 9. Past Sessions ─────────────────────────────────── */}
      <PastSessionsSection
        pastSessions={pastSessions}
        onConfirmDelete={(id, label) =>
          setConfirmState({ type: "session", id, label })
        }
        deletePending={deleteSessionPending}
      />

      {/* ── 11. Token Groups ─────────────────────────────────── */}
      <TokenGroupsSection
        groups={groups}
        onCreateGroup={handleCreateGroup}
        createPending={groupCreatePending}
        onConfirmDelete={(id, label) =>
          setConfirmState({ type: "group", id, label })
        }
        deletePending={groupDeletePending}
      />

      {/* ── 12. Untargeted Tokens ────────────────────────────── */}
      {untargetedSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-text-muted">
              {t("rebalance.untargetedTokens")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-text-subtle">
              {t("rebalance.untargetedDescription")}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-subtle">
                    <th className="pb-3 pr-4">{t("rebalance.token")}</th>
                    <th className="pb-3 pr-4 text-right">{t("rebalance.currentPercent")}</th>
                    <th className="pb-3 pr-4 text-right">{t("rebalance.currentValue")}</th>
                    <th className="pb-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {untargetedSuggestions.map((s) => (
                    <tr
                      key={s.tokenSymbol}
                      className="border-b border-border-subtle"
                    >
                      <td className="py-3 pr-4 font-medium text-text-muted">
                        {s.tokenSymbol}
                        <span className="ml-2 rounded bg-bg-muted px-1.5 py-0.5 text-xs text-text-subtle">
                          {t("rebalance.untargeted")}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right text-text-muted">
                        {s.currentPercent.toFixed(1)}%
                      </td>
                      <td className="py-3 pr-4 text-right text-text-muted">
                        {formatUsd(s.currentValue)}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addTargetFromUntargeted(s)}
                          disabled={targets.some(
                            (t) => t.tokenSymbol.toUpperCase() === s.tokenSymbol.toUpperCase()
                          )}
                          className="text-xs"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {t("rebalance.addTarget")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 13. Asset Categories ──────────────────────────────── */}
      <AssetCategoriesSection
        categories={categories}
        categoryBreakdown={categoryBreakdown}
        symbolOptions={tokenSymbolOptions}
        onSetCategory={handleSetCategory}
        setCategoryPending={categorySetPending}
        onConfirmDelete={(tokenSymbol, label) =>
          setConfirmState({ type: "category", id: tokenSymbol, label })
        }
        deletePending={categoryDeletePending}
      />

      {/* ── 14. What-If Calculator ───────────────────────────── */}
      <WhatIfCalculatorSection symbolOptions={tokenSymbolOptions} />

      {/* ── 15. Rebalance History ────────────────────────────── */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <button
              type="button"
              className="flex w-full items-center gap-2"
              onClick={() => setHistoryExpanded(!historyExpanded)}
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
          {historyExpanded && (
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
                      {log.deviationsSnapshot.map((d) => (
                        <span
                          key={d.tokenSymbol}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            Math.abs(d.deviation) > 5
                              ? "bg-status-negative-soft text-status-negative"
                              : Math.abs(d.deviation) > 1
                                ? "bg-status-warning-soft text-status-warning"
                                : "bg-status-positive-soft text-status-positive"
                          }`}
                        >
                          {d.tokenSymbol}: {d.deviation >= 0 ? "+" : ""}
                          {d.deviation.toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── 16. Empty state ──────────────────────────────────── */}
      {(!suggestionsData || suggestionsData.targets.length === 0) &&
        targets.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-text-subtle">
                {t("rebalance.emptyState")}
              </p>
            </CardContent>
          </Card>
        )}

      {/* ── Confirm Dialog ───────────────────────────────────── */}
      <ConfirmDialog
        open={confirmState !== null}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmState(null)}
        title={`${t("rebalance.delete")} ${confirmState?.label ?? t("rebalance.item")}?`}
        description={t("rebalance.cannotBeUndone")}
        confirmLabel={t("rebalance.delete")}
        variant="danger"
      />
    </div>
  );
}
