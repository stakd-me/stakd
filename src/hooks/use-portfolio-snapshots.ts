"use client";

import { useEffect, useRef } from "react";
import { useVaultStore } from "@/lib/store";
import { usePortfolio } from "@/hooks/use-portfolio";

const MIN_SNAPSHOT_INTERVAL_MINUTES = 12 * 60;
const MIN_PERCENT_CHANGE = 1;
const MAX_SNAPSHOTS = 2000;

/**
 * Records portfolio-value snapshots into the vault. Mounted ONCE in AppShell —
 * this must not live inside usePortfolio, where every page using the hook
 * would mount a competing copy of the effect and race to write the same
 * snapshot.
 */
export function usePortfolioSnapshots() {
  const vault = useVaultStore((s) => s.vault);
  const { breakdown, summary } = usePortfolio();
  const lastSnapshotSignatureRef = useRef<string | null>(null);

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

    const shouldCreateSnapshot =
      !latest ||
      minutesSinceLatest >= MIN_SNAPSHOT_INTERVAL_MINUTES ||
      percentChangeFromLatest > MIN_PERCENT_CHANGE;
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
            ? Math.abs(
                (roundedTotal - prevLatest.totalValueUsd) /
                  prevLatest.totalValueUsd
              ) * 100
            : 100;
        if (
          prevMinutesSinceLatest < MIN_SNAPSHOT_INTERVAL_MINUTES &&
          prevPercentChange <= MIN_PERCENT_CHANGE
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
      ].slice(-MAX_SNAPSHOTS);

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
}

export function PortfolioSnapshotRecorder() {
  usePortfolioSnapshots();
  return null;
}
