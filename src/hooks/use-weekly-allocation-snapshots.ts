"use client";

import { useEffect, useRef, useState } from "react";
import { usePrices } from "@/hooks/use-prices";
import { useAuthStore, useVaultStore } from "@/lib/store";
import {
  createWeeklyAllocationSnapshot,
  getMissingAllocationPriceTokens,
  getWeeklyAllocationWeekStartKey,
  hasAllocationSnapshotForWeek,
  isWeeklyAllocationUpdateDue,
  upsertAllocationSnapshot,
} from "@/lib/services/allocation-history";

const CHECK_INTERVAL_MS = 60_000;

export function useWeeklyAllocationSnapshots() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const vault = useVaultStore((state) => state.vault);
  const { priceMap, ensurePrices } = usePrices({ refetchInterval: CHECK_INTERVAL_MS });
  const requestedPriceKeysRef = useRef<Set<string>>(new Set());
  const [checkTick, setCheckTick] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      requestedPriceKeysRef.current.clear();
      return;
    }

    const timer = window.setInterval(() => {
      setCheckTick((current) => current + 1);
    }, CHECK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const missingTokens = getMissingAllocationPriceTokens(vault, priceMap);
    const tokensToEnsure = missingTokens.filter((token) => {
      const key = `${token.symbol}:${token.coingeckoId}`;
      if (requestedPriceKeysRef.current.has(key)) {
        return false;
      }
      requestedPriceKeysRef.current.add(key);
      return true;
    });

    if (tokensToEnsure.length > 0) {
      ensurePrices(tokensToEnsure).catch(() => {});
    }
  }, [ensurePrices, isAuthenticated, priceMap, vault]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const now = new Date();
    if (!isWeeklyAllocationUpdateDue(now)) {
      return;
    }

    const weekStart = getWeeklyAllocationWeekStartKey(now);
    if (hasAllocationSnapshotForWeek(vault.allocationSnapshots, weekStart)) {
      return;
    }

    const missingTokens = getMissingAllocationPriceTokens(vault, priceMap);
    if (missingTokens.length > 0) {
      return;
    }

    const snapshot = createWeeklyAllocationSnapshot(
      vault,
      priceMap,
      now,
      () => crypto.randomUUID()
    );

    if (!snapshot) {
      return;
    }

    useVaultStore.getState().updateVault((previous) => {
      if (
        hasAllocationSnapshotForWeek(
          previous.allocationSnapshots,
          snapshot.weekStart
        )
      ) {
        return previous;
      }

      return {
        ...previous,
        allocationSnapshots: upsertAllocationSnapshot(
          previous.allocationSnapshots,
          snapshot
        ),
      };
    });
  }, [checkTick, isAuthenticated, priceMap, vault]);
}

export function WeeklyAllocationSnapshotRecorder() {
  useWeeklyAllocationSnapshots();
  return null;
}
