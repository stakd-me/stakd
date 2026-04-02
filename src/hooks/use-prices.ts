"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store";
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

// ---------------------------------------------------------------------------
// SSE price stream hook (internal)
// ---------------------------------------------------------------------------

function usePriceStream() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sseConnected = useRef(false);

  useEffect(() => {
    if (!accessToken) {
      sseConnected.current = false;
      return;
    }

    const url = `/api/prices/stream?token=${encodeURIComponent(accessToken)}`;
    const es = new EventSource(url);

    es.addEventListener("prices", (event) => {
      try {
        const payload: Record<
          string,
          { usd: number; change24h: number | null; updatedAt: string }
        > = JSON.parse(event.data);

        const priceMap: PriceMap = {};
        const updatedAts: string[] = [];

        for (const [coingeckoId, p] of Object.entries(payload)) {
          priceMap[coingeckoId] = {
            usd: p.usd,
            change24h: p.change24h,
            updatedAt: p.updatedAt,
          };
          if (p.updatedAt) updatedAts.push(p.updatedAt);
        }

        const oldestUpdatedAt =
          updatedAts.length > 0
            ? updatedAts.reduce((oldest, v) => (v < oldest ? v : oldest))
            : null;

        queryClient.setQueryData(["prices"], (prev: { priceMap: PriceMap; updatedAt: string | null } | undefined) => {
          // Merge SSE data with existing data (SSE may not include all tokens initially)
          const merged = { ...prev?.priceMap, ...priceMap };
          return {
            priceMap: merged,
            updatedAt: oldestUpdatedAt ?? prev?.updatedAt ?? null,
          };
        });
      } catch {
        // ignore parse errors
      }
    });

    es.onopen = () => {
      sseConnected.current = true;
    };

    es.onerror = () => {
      sseConnected.current = false;
      // EventSource auto-reconnects; we just track state
    };

    return () => {
      es.close();
      sseConnected.current = false;
    };
  }, [accessToken, queryClient]);

  return sseConnected;
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

interface UsePricesOptions {
  refetchInterval?: number;
}

export function usePrices(options?: UsePricesOptions) {
  const queryClient = useQueryClient();
  const sseConnected = usePriceStream();

  // When SSE is connected, use a longer polling interval as fallback.
  // When SSE is disconnected, poll more aggressively.
  const fallbackInterval = options?.refetchInterval ?? 60_000;
  const refetchInterval = sseConnected.current ? fallbackInterval : 10_000;

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
    refetchInterval,
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
