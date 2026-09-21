"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import {
  getHoldings,
  summarizeHoldings,
} from "@/lib/services/portfolio-calculator";
import { getOldestPriceUpdateForTokens } from "@/lib/pricing/freshness";
import { useChartSeries } from "@/hooks/use-chart-theme";

export interface PortfolioBreakdownItem {
  holdingKey: string;
  symbol: string;
  tokenName: string;
  coingeckoId: string | null;
  value: number;
  percent: number;
  color: string;
  quantity: number;
  avgCost: number;
  avgCostOverride: number | null;
  currentPrice: number;
  change24h: number | null;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
}

export function usePortfolio() {
  const vault = useVaultStore((s) => s.vault);
  const { priceMap, updatedAt, isLoading: pricesLoading, refreshPrices, ensurePrices } = usePrices();
  const ensuredTokensRef = useRef<Set<string>>(new Set());
  // The one categorical ordering, read from the --chart-series-* tokens.
  const series = useChartSeries();

  const holdings = useMemo(
    () => getHoldings(vault, priceMap),
    [vault, priceMap]
  );

  const summary = useMemo(() => summarizeHoldings(holdings), [holdings]);

  // Auto-ensure prices exist for all held tokens (subscribes to WS for real-time updates)
  useEffect(() => {
    const missing = holdings
      .filter((h) => h.currentQty > 0 && h.currentPrice === 0)
      .filter((h) => {
        const key = `${h.symbol}:${h.coingeckoId ?? ""}`;
        if (ensuredTokensRef.current.has(key)) return false;
        ensuredTokensRef.current.add(key);
        return true;
      })
      .map((h) => ({ coingeckoId: h.coingeckoId ?? h.symbol.toLowerCase(), symbol: h.symbol }));

    if (missing.length > 0) {
      ensurePrices(missing).catch(() => {});
    }
  }, [holdings, ensurePrices]);

  const breakdown = useMemo((): PortfolioBreakdownItem[] => {
    return holdings
      .filter((h) => h.currentQty > 0)
      .map((h, i) => ({
        holdingKey: `${h.symbol.toUpperCase()}:${h.coingeckoId ?? ""}`,
        symbol: h.symbol,
        tokenName: h.tokenName,
        coingeckoId: h.coingeckoId,
        value: h.currentValue,
        percent: summary.totalValueUsd > 0
          ? Math.round((h.currentValue / summary.totalValueUsd) * 10000) / 100
          : 0,
        color: series[i % series.length],
        quantity: h.currentQty,
        avgCost: h.avgCostBasis,
        avgCostOverride: h.avgCostOverrideUsd,
        currentPrice: h.currentPrice,
        change24h: h.change24h,
        unrealizedPL: h.unrealizedPL,
        unrealizedPLPercent: h.unrealizedPLPercent,
        realizedPL: h.realizedPL,
      }));
  }, [holdings, summary.totalValueUsd, series]);

  const totals = useMemo(() => {
    let totalUnrealizedPL = 0;
    let totalRealizedPL = 0;
    let totalFeesPaid = 0;
    let weightedChange24h = 0;

    for (const h of holdings) {
      totalUnrealizedPL += h.unrealizedPL;
      totalRealizedPL += h.realizedPL;
      totalFeesPaid += h.totalFees;
      if (h.change24h !== null && summary.totalValueUsd > 0) {
        weightedChange24h += (h.currentValue / summary.totalValueUsd) * h.change24h;
      }
    }

    return {
      totalValue: summary.totalValueUsd,
      totalPL: totalUnrealizedPL + totalRealizedPL,
      totalUnrealizedPL,
      totalRealizedPL,
      totalFeesPaid,
      change24h: weightedChange24h,
    };
  }, [holdings, summary.totalValueUsd]);

  const history = useMemo(() => {
    const sorted = vault.portfolioSnapshots
      .map((s) => ({ date: s.snapshotAt, value: s.totalValueUsd }))
      .filter(
        (point) =>
          typeof point.date === "string" &&
          point.date.length > 0 &&
          Number.isFinite(point.value)
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    if (sorted.length === 0 && summary.totalValueUsd > 0) {
      return [{ date: new Date().toISOString(), value: summary.totalValueUsd }];
    }

    return sorted;
  }, [vault.portfolioSnapshots, summary.totalValueUsd]);

  const lastPriceUpdate = useMemo(() => {
    const hasActiveHoldings = holdings.some((holding) => holding.currentQty > 0);
    const oldestFromRelevantTokens = getOldestPriceUpdateForTokens(
      priceMap,
      holdings
        .filter((holding) => holding.currentQty > 0)
        .map((holding) => ({
          coingeckoId: holding.coingeckoId,
          symbol: holding.symbol,
        }))
    );

    if (!oldestFromRelevantTokens) {
      return hasActiveHoldings ? null : updatedAt;
    }

    return oldestFromRelevantTokens;
  }, [holdings, priceMap, updatedAt]);

  return {
    holdings,
    summary,
    breakdown,
    totals,
    history,
    lastPriceUpdate,
    isLoading: pricesLoading,
    refreshPrices,
  };
}
