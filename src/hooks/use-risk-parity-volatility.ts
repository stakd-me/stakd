"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { VolatilityMap } from "@/lib/services/rebalance-strategies";

interface VolatilityResponse {
  volatilities: Record<string, { volatility: number; dataPoints: number }>;
}

const DEFAULT_LOOKBACK_DAYS = 30;
const MIN_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;

export function useRiskParityVolatility(
  coingeckoIds: string[],
  enabled: boolean,
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS
) {
  const normalizedIds = useMemo(() => {
    return Array.from(
      new Set(
        coingeckoIds
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      )
    ).sort();
  }, [coingeckoIds]);
  const normalizedLookbackDays = Number.isFinite(lookbackDays)
    ? Math.max(
        MIN_LOOKBACK_DAYS,
        Math.min(MAX_LOOKBACK_DAYS, Math.round(lookbackDays))
      )
    : DEFAULT_LOOKBACK_DAYS;

  const query = useQuery<VolatilityMap>({
    queryKey: [
      "risk-parity-volatility",
      normalizedIds.join(","),
      normalizedLookbackDays,
    ],
    enabled: enabled && normalizedIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({
        ids: normalizedIds.join(","),
        lookbackDays: String(normalizedLookbackDays),
      });
      const res = await apiFetch(`/api/prices/volatility?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch risk-parity volatility data");
      }
      const data: VolatilityResponse = await res.json();
      const output: VolatilityMap = {};
      for (const [coingeckoId, entry] of Object.entries(data.volatilities || {})) {
        if (!Number.isFinite(entry.volatility)) continue;
        output[coingeckoId] = { volatility: entry.volatility };
      }
      return output;
    },
  });

  return {
    volatilities: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
