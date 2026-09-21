"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

// ---------------------------------------------------------------------------
// Price stream: ONE connection per document
// ---------------------------------------------------------------------------
//
// This used to open a stream per hook instance. Every component that wants a
// price opens one — the app bar, the rail, the tab bar, the page itself — and
// a browser allows only six concurrent HTTP/1.1 connections per origin, so a
// handful of consumers was enough to exhaust the pool and wedge the tab:
// navigations and API calls simply never got a socket. The connection is now
// shared and reference-counted.

type PriceStreamListener = (connected: boolean) => void;

const streamListeners = new Set<PriceStreamListener>();
let streamRefCount = 0;
let streamConnected = false;
let streamStop: (() => void) | null = null;
let streamToken: string | null = null;

function setStreamConnected(next: boolean) {
  if (streamConnected === next) return;
  streamConnected = next;
  for (const listener of streamListeners) listener(next);
}

function openPriceStream(queryClient: QueryClient): () => void {
  let aborted = false;
  const abortController = new AbortController();
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

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
      (prev: { priceMap: PriceMap; updatedAt: string | null } | undefined) => {
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
          setStreamConnected(false);
          return;
        }
        throw new Error(`SSE response ${res.status}`);
      }

      if (!aborted) setStreamConnected(true);
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
      setStreamConnected(false);
      reconnectTimeout = setTimeout(connect, 3_000);
    }
  };

  void connect();

  return () => {
    aborted = true;
    abortController.abort();
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };
}

function acquirePriceStream(
  queryClient: QueryClient,
  token: string
): () => void {
  streamRefCount += 1;

  // A new session means a new stream, even if the old one is still open.
  if (streamStop && streamToken !== token) {
    streamStop();
    streamStop = null;
    setStreamConnected(false);
  }
  streamToken = token;
  if (!streamStop) streamStop = openPriceStream(queryClient);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    streamRefCount -= 1;
    if (streamRefCount > 0) return;
    streamRefCount = 0;
    streamStop?.();
    streamStop = null;
    streamToken = null;
    setStreamConnected(false);
  };
}

function subscribeToStreamState(onChange: () => void): () => void {
  const listener: PriceStreamListener = () => onChange();
  streamListeners.add(listener);
  return () => {
    streamListeners.delete(listener);
  };
}

function usePriceStream(): boolean {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;
    return acquirePriceStream(queryClient, accessToken);
  }, [accessToken, queryClient]);

  // The connection is an external store, so read it as one rather than
  // mirroring it into component state from inside an effect.
  return useSyncExternalStore(
    subscribeToStreamState,
    () => streamConnected,
    () => false
  );
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
