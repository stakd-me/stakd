"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import {
  getHoldings,
  getPortfolioSummary,
} from "@/lib/services/portfolio-calculator";

const COLORS = [
  "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444",
  "#06b6d4", "#ec4899", "#f97316", "#6366f1", "#14b8a6",
];

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
  currentPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
}

export function usePortfolio() {
  const vault = useVaultStore((s) => s.vault);
  const { priceMap, updatedAt, isLoading: pricesLoading, refreshPrices } = usePrices();
  const lastSnapshotSignatureRef = useRef<string | null>(null);

  const holdings = useMemo(
    () => getHoldings(vault, priceMap),
    [vault, priceMap]
  );

  const summary = useMemo(
    () => getPortfolioSummary(vault, priceMap),
    [vault, priceMap]
  );

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
        color: COLORS[i % COLORS.length],
        quantity: h.currentQty,
        avgCost: h.avgCostBasis,
        currentPrice: h.currentPrice,
        unrealizedPL: h.unrealizedPL,
        unrealizedPLPercent: h.unrealizedPLPercent,
        realizedPL: h.realizedPL,
      }));
  }, [holdings, summary.totalValueUsd]);

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
    const relevantUpdatedAts = holdings
      .filter((holding) => holding.currentQty > 0 && !!holding.coingeckoId)
      .map((holding) => {
        const coingeckoId = holding.coingeckoId?.trim().toLowerCase();
        if (!coingeckoId) return null;
        return priceMap[coingeckoId]?.updatedAt ?? null;
      })
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    if (relevantUpdatedAts.length === 0) {
      return hasActiveHoldings ? null : updatedAt;
    }

    return relevantUpdatedAts.reduce((oldest, value) =>
      value < oldest ? value : oldest
    );
  }, [holdings, priceMap, updatedAt]);

  useEffect(() => {
    const hasPositions =
      vault.transactions.length > 0 || vault.manualEntries.length > 0;
    if (!hasPositions || summary.totalValueUsd <= 0 || breakdown.length === 0) {
      return;
    }

    const roundedTotal = Math.round(summary.totalValueUsd * 100) / 100;
    const latest = vault.portfolioSnapshots[vault.portfolioSnapshots.length - 1];
    const nowMs = Date.now();
    const latestMs = latest ? new Date(latest.snapshotAt).getTime() : 0;
    const minutesSinceLatest = latest ? (nowMs - latestMs) / 60000 : Infinity;
    const latestTotal = latest?.totalValueUsd ?? 0;
    const percentChangeFromLatest =
      latest && latestTotal > 0
        ? Math.abs((roundedTotal - latestTotal) / latestTotal) * 100
        : 100;

    const minSnapshotIntervalMinutes = 30;
    const minPercentChange = 0.5;
    const shouldCreateSnapshot =
      !latest ||
      minutesSinceLatest >= minSnapshotIntervalMinutes ||
      percentChangeFromLatest >= minPercentChange;
    if (!shouldCreateSnapshot) return;

    const signature = `${roundedTotal}|${breakdown.length}|${vault.transactions.length}|${vault.manualEntries.length}`;
    if (
      lastSnapshotSignatureRef.current === signature &&
      minutesSinceLatest < 5
    ) {
      return;
    }
    lastSnapshotSignatureRef.current = signature;

    const snapshotBreakdown = breakdown.map((item) => ({
      symbol: item.symbol,
      coingeckoId: item.coingeckoId,
      valueUsd: Math.round(item.value * 100) / 100,
      percent: Math.round(item.percent * 100) / 100,
    }));

    useVaultStore.getState().updateVault((prev) => {
      const prevLatest =
        prev.portfolioSnapshots[prev.portfolioSnapshots.length - 1];
      if (prevLatest) {
        const prevLatestMs = new Date(prevLatest.snapshotAt).getTime();
        const prevMinutesSinceLatest = (Date.now() - prevLatestMs) / 60000;
        const prevPercentChange =
          prevLatest.totalValueUsd > 0
            ? Math.abs((roundedTotal - prevLatest.totalValueUsd) / prevLatest.totalValueUsd) * 100
            : 100;
        if (
          prevMinutesSinceLatest < minSnapshotIntervalMinutes &&
          prevPercentChange < minPercentChange
        ) {
          return prev;
        }
      }

      const nextSnapshots = [
        ...prev.portfolioSnapshots,
        {
          id: crypto.randomUUID(),
          totalValueUsd: roundedTotal,
          breakdown: JSON.stringify(snapshotBreakdown),
          snapshotAt: new Date().toISOString(),
        },
      ].slice(-2000);

      return {
        ...prev,
        portfolioSnapshots: nextSnapshots,
      };
    });
  }, [
    breakdown,
    summary.totalValueUsd,
    vault.manualEntries.length,
    vault.portfolioSnapshots,
    vault.transactions.length,
  ]);

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
