"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PriceData } from "@/lib/services/portfolio-calculator";

export type PriceMap = Record<string, PriceData>;

interface PriceArrayRow {
  coingeckoId: string;
  priceUsd?: number;
  usd?: number;
  change24h: number | null;
  updatedAt?: string | null;
}

interface PriceObjectRow {
  symbol?: string;
  priceUsd?: number;
  usd?: number;
  change24h: number | null;
  updatedAt?: string | Date | null;
}

interface PricesResponse {
  prices: PriceArrayRow[] | Record<string, PriceObjectRow>;
  updatedAt: string | null;
}

function normalizeIsoDate(
  value: string | Date | null | undefined
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toPriceMap(prices: PricesResponse["prices"]): {
  priceMap: PriceMap;
  oldestUpdatedAt: string | null;
} {
  const map: PriceMap = {};
  const updatedAts: string[] = [];

  if (Array.isArray(prices)) {
    for (const p of prices) {
      const usd = typeof p.priceUsd === "number"
        ? p.priceUsd
        : typeof p.usd === "number"
          ? p.usd
          : 0;
      const updatedAt = normalizeIsoDate(p.updatedAt);
      if (updatedAt) updatedAts.push(updatedAt);
      map[p.coingeckoId] = {
        usd,
        change24h: p.change24h ?? null,
        updatedAt,
      };
    }
  } else {
    for (const [coingeckoId, p] of Object.entries(prices)) {
      const usd = typeof p.priceUsd === "number"
        ? p.priceUsd
        : typeof p.usd === "number"
          ? p.usd
          : 0;
      const updatedAt = normalizeIsoDate(p.updatedAt);
      if (updatedAt) updatedAts.push(updatedAt);
      map[coingeckoId] = {
        usd,
        change24h: p.change24h ?? null,
        updatedAt,
      };
    }
  }

  const oldestUpdatedAt =
    updatedAts.length > 0
      ? updatedAts.reduce((oldest, value) => value < oldest ? value : oldest)
      : null;

  return { priceMap: map, oldestUpdatedAt };
}

export function usePrices() {
  const queryClient = useQueryClient();

  const query = useQuery<{ priceMap: PriceMap; updatedAt: string | null }>({
    queryKey: ["prices"],
    queryFn: async () => {
      const res = await apiFetch("/api/prices");
      if (!res.ok) throw new Error("Failed to fetch prices");
      const data: PricesResponse = await res.json();
      const { priceMap, oldestUpdatedAt } = toPriceMap(data.prices);
      return {
        priceMap,
        updatedAt: data.updatedAt ?? oldestUpdatedAt,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const refreshPrices = async () => {
    await apiFetch("/api/prices/refresh", { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["prices"] });
  };

  const ensurePrices = async (tokens: { coingeckoId: string; symbol: string }[]) => {
    await apiFetch("/api/prices/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens }),
    });
    await queryClient.invalidateQueries({ queryKey: ["prices"] });
  };

  return {
    priceMap: query.data?.priceMap ?? {},
    updatedAt: query.data?.updatedAt ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refreshPrices,
    ensurePrices,
  };
}
