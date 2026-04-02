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
// SSE price stream hook (fetch-based, supports Authorization header)
// ---------------------------------------------------------------------------

function parseSseEvents(
  chunk: string,
  buffer: string
): { events: { event: string; data: string }[]; remaining: string } {
  const text = buffer + chunk;
  const events: { event: string; data: string }[] = [];
  const blocks = text.split("\n\n");
  // Last element may be incomplete
  const remaining = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
      else if (line.startsWith(":")) continue; // comment / heartbeat
    }
    if (data) events.push({ event, data });
  }
  return { events, remaining };
}

function usePriceStream() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sseConnected = useRef(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!accessToken) {
      sseConnected.current = false;
      return;
    }

    let aborted = false;
    const abortController = new AbortController();

    const applyPriceEvent = (data: string) => {
      try {
        const payload: Record<
          string,
          { usd: number; change24h: number | null; updatedAt: string }
        > = JSON.parse(data);

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

        const newestUpdatedAt =
          updatedAts.length > 0
            ? updatedAts.reduce((newest, v) => (v > newest ? v : newest))
            : null;

        queryClient.setQueryData(
          ["prices"],
          (
            prev:
              | { priceMap: PriceMap; updatedAt: string | null }
              | undefined
          ) => ({
            priceMap: { ...prev?.priceMap, ...priceMap },
            updatedAt: newestUpdatedAt ?? prev?.updatedAt ?? null,
          })
        );
      } catch {
        // ignore parse errors
      }
    };

    const connect = async () => {
      if (aborted) return;

      try {
        // Use fresh token on each connection attempt
        const currentToken = useAuthStore.getState().accessToken;
        if (!currentToken) return;

        const res = await fetch("/api/prices/stream", {
          headers: { Authorization: `Bearer ${currentToken}` },
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) {
          // On 401, don't retry — let the polling fallback handle it
          if (res.status === 401) {
            sseConnected.current = false;
            return;
          }
          throw new Error(`SSE response ${res.status}`);
        }

        sseConnected.current = true;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const { events, remaining } = parseSseEvents(chunk, sseBuffer);
          sseBuffer = remaining;

          for (const evt of events) {
            if (evt.event === "prices") {
              applyPriceEvent(evt.data);
            }
          }
        }
      } catch {
        if (aborted) return;
        // Connection lost — schedule reconnect
      }

      sseConnected.current = false;
      if (!aborted) {
        reconnectTimeout.current = setTimeout(connect, 3_000);
      }
    };

    void connect();

    return () => {
      aborted = true;
      abortController.abort();
      sseConnected.current = false;
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
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

  // Disable REST polling when SSE is connected to prevent overwriting fresh data.
  // Only poll as fallback when SSE is disconnected.
  const refetchInterval = sseConnected.current
    ? false
    : (options?.refetchInterval ?? 10_000);

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
