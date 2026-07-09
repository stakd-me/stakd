"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store";
import {
  mergePriceEntries,
  type PriceEntry,
  type PriceMap,
} from "@/lib/pricing/price-map";

export type { PriceMap } from "@/lib/pricing/price-map";

interface PriceArrayRow {
  coingeckoId: string;
  symbol?: string;
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

// Live ticks are coalesced so at most one cache update (and therefore one
// re-render of price consumers) happens per interval.
const SSE_FLUSH_INTERVAL_MS = 1_000;

function normalizeIsoDate(
  value: string | Date | null | undefined
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toPriceEntries(prices: PricesResponse["prices"]): PriceEntry[] {
  const rows: [string, PriceArrayRow | PriceObjectRow][] = Array.isArray(prices)
    ? prices.map((p) => [p.coingeckoId, p])
    : Object.entries(prices);

  return rows.map(([coingeckoId, p]) => ({
    coingeckoId,
    symbol: p.symbol ?? null,
    usd:
      typeof p.priceUsd === "number"
        ? p.priceUsd
        : typeof p.usd === "number"
          ? p.usd
          : 0,
    change24h: p.change24h ?? null,
    updatedAt: normalizeIsoDate(p.updatedAt),
  }));
}

function toPriceMap(prices: PricesResponse["prices"]): {
  priceMap: PriceMap;
  oldestUpdatedAt: string | null;
} {
  const entries = toPriceEntries(prices);
  const updatedAts = entries
    .map((e) => e.updatedAt)
    .filter((v): v is string => Boolean(v));

  const oldestUpdatedAt =
    updatedAts.length > 0
      ? updatedAts.reduce((oldest, value) => (value < oldest ? value : oldest))
      : null;

  return { priceMap: mergePriceEntries(undefined, entries), oldestUpdatedAt };
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

function priceEntryChanged(
  prev: PriceMap | undefined,
  entry: PriceEntry
): boolean {
  const current = prev?.[entry.coingeckoId.trim().toLowerCase()];
  if (!current) return true;
  return (
    current.usd !== entry.usd ||
    current.change24h !== entry.change24h ||
    current.updatedAt !== entry.updatedAt
  );
}

function usePriceStream(): boolean {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  // State (not a ref) so usePrices' refetchInterval reacts to connect/drop.
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setConnected(false);
      return;
    }

    let aborted = false;
    const abortController = new AbortController();

    // Tick coalescing: incoming events accumulate here and flush at most
    // once per SSE_FLUSH_INTERVAL_MS.
    const pending = new Map<string, PriceEntry>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFlushAt = 0;

    const flush = () => {
      flushTimer = null;
      lastFlushAt = Date.now();
      if (pending.size === 0) return;
      const entries = [...pending.values()];
      pending.clear();

      queryClient.setQueryData(
        ["prices"],
        (
          prev: { priceMap: PriceMap; updatedAt: string | null } | undefined
        ) => {
          const changed = entries.filter((e) =>
            priceEntryChanged(prev?.priceMap, e)
          );
          // Keep the object identity stable when nothing moved so memoized
          // consumers don't recompute.
          if (changed.length === 0) return prev;

          const updatedAts = changed
            .map((e) => e.updatedAt)
            .filter((v): v is string => Boolean(v));
          const newestUpdatedAt =
            updatedAts.length > 0
              ? updatedAts.reduce((newest, v) => (v > newest ? v : newest))
              : null;

          return {
            priceMap: mergePriceEntries(prev?.priceMap, changed),
            updatedAt: newestUpdatedAt ?? prev?.updatedAt ?? null,
          };
        }
      );
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      const delay = Math.max(
        0,
        SSE_FLUSH_INTERVAL_MS - (Date.now() - lastFlushAt)
      );
      flushTimer = setTimeout(flush, delay);
    };

    const applyPriceEvent = (data: string) => {
      try {
        const payload: Record<
          string,
          { usd: number; change24h: number | null; updatedAt: string }
        > = JSON.parse(data);

        for (const [coingeckoId, p] of Object.entries(payload)) {
          pending.set(coingeckoId, {
            coingeckoId,
            usd: p.usd,
            change24h: p.change24h,
            updatedAt: p.updatedAt ?? null,
          });
        }
        scheduleFlush();
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
            setConnected(false);
            return;
          }
          throw new Error(`SSE response ${res.status}`);
        }

        if (!aborted) setConnected(true);
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

      if (!aborted) {
        setConnected(false);
        reconnectTimeout.current = setTimeout(connect, 3_000);
      }
    };

    void connect();

    return () => {
      aborted = true;
      abortController.abort();
      setConnected(false);
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
    };
  }, [accessToken, queryClient]);

  return connected;
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
  const refetchInterval = sseConnected
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

  // Stable identities so consumers can safely list these in hook deps.
  const refreshPrices = useCallback(async () => {
    await apiFetch("/api/prices/refresh", { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["prices"] });
  }, [queryClient]);

  const ensurePrices = useCallback(
    async (tokens: { coingeckoId: string; symbol: string }[]) => {
      await apiFetch("/api/prices/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      await queryClient.invalidateQueries({ queryKey: ["prices"] });
    },
    [queryClient]
  );

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
