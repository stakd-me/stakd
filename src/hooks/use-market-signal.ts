"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface MarketSignalData {
  fearGreed: { value: number; label: string } | null;
  btc200wMa: { price: number; ma: number; ratio: number } | null;
  cyclePosition: { daysSinceHalving: number; percent: number } | null;
  composite: {
    phase: "accumulate" | "hold" | "caution" | "danger";
    score: number;
  };
  fetchedAt: string;
}

export function useMarketSignal() {
  return useQuery<MarketSignalData>({
    queryKey: ["market-signal"],
    queryFn: async () => {
      const res = await apiFetch("/api/market-signal");
      if (!res.ok) throw new Error("Failed to fetch market signal");
      return res.json();
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 15 * 60 * 1000, // 15 minutes
    retry: 1,
  });
}
