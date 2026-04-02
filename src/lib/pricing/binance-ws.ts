import WebSocket from "ws";
import { EventEmitter } from "events";
import { db, schema } from "@/lib/db";
import { persistPriceRows, type PriceWriteRow } from "@/lib/pricing";
import {
  BINANCE_SYMBOL_TO_COINGECKO_ID,
  COINGECKO_TO_BINANCE_SYMBOL,
  resolveBinanceSymbol,
} from "./binance-symbol-resolver";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InMemoryPrice {
  priceUsd: number;
  change24h: number | null;
  updatedAt: number; // epoch ms
}

interface MiniTickerPayload {
  e: string; // event type "24hrMiniTicker"
  s: string; // symbol e.g. "BTCUSDT"
  c: string; // close price
  o: string; // open price
}

interface CombinedStreamMessage {
  stream: string;
  data: MiniTickerPayload;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BINANCE_WS_BASE = "wss://stream.binance.com:9443/stream";
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const STALE_TIMEOUT_MS = 30_000;
const PROACTIVE_RECONNECT_MS = 23 * 60 * 60 * 1_000; // 23 hours
const DB_PERSIST_INTERVAL_MS = 5 * 60 * 1_000;
const HISTORY_PERSIST_INTERVAL_MS = 15 * 60 * 1_000; // 15 min
const SSE_BROADCAST_INTERVAL_MS = 1_000;

// ---------------------------------------------------------------------------
// BinanceWebSocketManager
// ---------------------------------------------------------------------------

export class BinanceWebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private prices = new Map<string, InMemoryPrice>(); // keyed by coingeckoId
  private symbolToCoingeckoId = new Map<string, string>(); // BTCUSDT -> bitcoin
  private subscribedSymbols = new Set<string>(); // BTC, ETH, ...
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private proactiveReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private dbPersistTimer: ReturnType<typeof setInterval> | null = null;
  private historyPersistTimer: ReturnType<typeof setInterval> | null = null;
  private sseBroadcastTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private lastBroadcastData: string | null = null;

  // ---- Lifecycle -----------------------------------------------------------

  start(symbols: string[]): void {
    this.stopped = false;
    for (const sym of symbols) {
      this.subscribedSymbols.add(sym.toUpperCase());
    }
    this.buildSymbolMap();
    this.connect();
    this.startDbPersistLoop();
    this.startHistoryPersistLoop();
    this.startSseBroadcastLoop();
  }

  stop(): void {
    this.stopped = true;
    this.clearAllTimers();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  /** Add symbols to a live connection via SUBSCRIBE */
  subscribe(symbols: string[]): void {
    const newSymbols: string[] = [];
    for (const sym of symbols) {
      const upper = sym.toUpperCase();
      if (!this.subscribedSymbols.has(upper)) {
        this.subscribedSymbols.add(upper);
        newSymbols.push(upper);
      }
    }
    if (newSymbols.length === 0) return;
    this.buildSymbolMap();

    if (this.ws?.readyState === WebSocket.OPEN) {
      const streams = newSymbols.map((s) => `${s.toLowerCase()}usdt@miniTicker`);
      this.ws.send(
        JSON.stringify({ method: "SUBSCRIBE", params: streams, id: Date.now() })
      );
      console.log(`[binance-ws] Subscribed to ${newSymbols.length} new symbols`);
    }
  }

  /** Get a snapshot of the full in-memory price map (keyed by coingeckoId) */
  getPrices(): Map<string, InMemoryPrice> {
    return new Map(this.prices);
  }

  /** Merge non-Binance prices from DB into the in-memory map */
  mergeNonBinancePrices(
    rows: { coingeckoId: string; priceUsd: number; change24h: number | null; updatedAt: Date }[]
  ): void {
    for (const row of rows) {
      // Only set if not already fed by WebSocket
      const binanceSymbol = COINGECKO_TO_BINANCE_SYMBOL[row.coingeckoId];
      if (binanceSymbol && this.subscribedSymbols.has(binanceSymbol)) continue;
      this.prices.set(row.coingeckoId, {
        priceUsd: row.priceUsd,
        change24h: row.change24h,
        updatedAt: row.updatedAt.getTime(),
      });
    }
  }

  // ---- Connection ----------------------------------------------------------

  private buildSymbolMap(): void {
    this.symbolToCoingeckoId.clear();
    for (const sym of this.subscribedSymbols) {
      const pairKey = `${sym}USDT`;
      const coingeckoId = BINANCE_SYMBOL_TO_COINGECKO_ID[sym];
      if (coingeckoId) {
        this.symbolToCoingeckoId.set(pairKey, coingeckoId);
      }
    }
  }

  private connect(): void {
    if (this.stopped) return;

    const streams = Array.from(this.subscribedSymbols)
      .map((s) => `${s.toLowerCase()}usdt@miniTicker`)
      .join("/");

    if (!streams) {
      console.warn("[binance-ws] No symbols to subscribe to");
      return;
    }

    const url = `${BINANCE_WS_BASE}?streams=${streams}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error("[binance-ws] Failed to create WebSocket:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      console.log(
        `[binance-ws] Connected, streaming ${this.subscribedSymbols.size} symbols`
      );
      this.reconnectAttempts = 0;
      this.resetStaleTimer();
      this.scheduleProactiveReconnect();
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      this.resetStaleTimer();
      try {
        const msg: CombinedStreamMessage = JSON.parse(data.toString());
        this.handleTicker(msg.data);
      } catch {
        // ignore parse errors (e.g. subscription confirmations)
      }
    });

    this.ws.on("close", () => {
      console.warn("[binance-ws] Connection closed");
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[binance-ws] WebSocket error:", err.message);
      // close event will follow; reconnect handled there
    });

    this.ws.on("pong", () => {
      this.resetStaleTimer();
    });
  }

  private handleTicker(payload: MiniTickerPayload): void {
    if (!payload?.s || !payload?.c) return;

    const coingeckoId = this.symbolToCoingeckoId.get(payload.s);
    if (!coingeckoId) return;

    const closePrice = parseFloat(payload.c);
    const openPrice = parseFloat(payload.o);
    if (!Number.isFinite(closePrice) || closePrice <= 0) return;

    let change24h: number | null = null;
    if (Number.isFinite(openPrice) && openPrice > 0) {
      change24h = ((closePrice - openPrice) / openPrice) * 100;
    }

    this.prices.set(coingeckoId, {
      priceUsd: closePrice,
      change24h,
      updatedAt: Date.now(),
    });
  }

  // ---- Reconnection --------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.clearTimer("reconnectTimer");
    this.clearTimer("proactiveReconnectTimer");

    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_MS
    );
    this.reconnectAttempts++;

    console.log(`[binance-ws] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.close();
        this.ws = null;
      }
      this.connect();
    }, delay);
  }

  private scheduleProactiveReconnect(): void {
    this.clearTimer("proactiveReconnectTimer");
    this.proactiveReconnectTimer = setTimeout(() => {
      console.log("[binance-ws] Proactive reconnect (23h limit)");
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.close();
        this.ws = null;
      }
      this.reconnectAttempts = 0;
      this.connect();
    }, PROACTIVE_RECONNECT_MS);
    if (typeof this.proactiveReconnectTimer === "object" && "unref" in this.proactiveReconnectTimer) {
      this.proactiveReconnectTimer.unref();
    }
  }

  private resetStaleTimer(): void {
    this.clearTimer("staleTimer");
    this.staleTimer = setTimeout(() => {
      console.warn("[binance-ws] No messages for 30s, forcing reconnect");
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.close();
        this.ws = null;
      }
      this.reconnectAttempts = 0;
      this.connect();
    }, STALE_TIMEOUT_MS);
  }

  // ---- DB persistence (throttled) ------------------------------------------

  private startDbPersistLoop(): void {
    this.dbPersistTimer = setInterval(() => {
      void this.persistToDb(false);
    }, DB_PERSIST_INTERVAL_MS);
    if (typeof this.dbPersistTimer === "object" && "unref" in this.dbPersistTimer) {
      this.dbPersistTimer.unref();
    }
  }

  private startHistoryPersistLoop(): void {
    this.historyPersistTimer = setInterval(() => {
      void this.persistToDb(true);
    }, HISTORY_PERSIST_INTERVAL_MS);
    if (typeof this.historyPersistTimer === "object" && "unref" in this.historyPersistTimer) {
      this.historyPersistTimer.unref();
    }
  }

  private async persistToDb(includeHistory: boolean): Promise<void> {
    const rows: PriceWriteRow[] = [];
    const now = new Date();

    for (const [coingeckoId, price] of this.prices) {
      // Only persist Binance-fed prices (non-Binance ones are managed by background refresh)
      const binanceSymbol = COINGECKO_TO_BINANCE_SYMBOL[coingeckoId];
      if (!binanceSymbol || !this.subscribedSymbols.has(binanceSymbol)) continue;

      rows.push({
        coingeckoId,
        symbol: binanceSymbol,
        priceUsd: price.priceUsd,
        change24h: price.change24h,
      });
    }

    if (rows.length === 0) return;

    try {
      if (includeHistory) {
        await persistPriceRows(rows, now);
      } else {
        // Prices-only upsert (no history rows)
        const { sql } = await import("drizzle-orm");
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          await db
            .insert(schema.prices)
            .values(
              chunk.map((row) => ({
                coingeckoId: row.coingeckoId,
                symbol: row.symbol,
                priceUsd: row.priceUsd,
                change24h: row.change24h,
                updatedAt: now,
              }))
            )
            .onConflictDoUpdate({
              target: schema.prices.coingeckoId,
              set: {
                symbol: sql`excluded.symbol`,
                priceUsd: sql`excluded.price_usd`,
                change24h: sql`excluded.change_24h`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }
      }
    } catch (err) {
      console.error("[binance-ws] DB persist error:", err);
    }
  }

  // ---- SSE broadcast -------------------------------------------------------

  private startSseBroadcastLoop(): void {
    this.sseBroadcastTimer = setInterval(() => {
      this.broadcastPrices();
    }, SSE_BROADCAST_INTERVAL_MS);
    if (typeof this.sseBroadcastTimer === "object" && "unref" in this.sseBroadcastTimer) {
      this.sseBroadcastTimer.unref();
    }
  }

  private broadcastPrices(): void {
    if (this.listenerCount("prices") === 0) return;

    const payload: Record<
      string,
      { usd: number; change24h: number | null; updatedAt: string }
    > = {};

    for (const [coingeckoId, price] of this.prices) {
      payload[coingeckoId] = {
        usd: price.priceUsd,
        change24h: price.change24h,
        updatedAt: new Date(price.updatedAt).toISOString(),
      };
    }

    const data = JSON.stringify(payload);
    // Skip if identical to last broadcast
    if (data === this.lastBroadcastData) return;
    this.lastBroadcastData = data;

    this.emit("prices", data);
  }

  // ---- Helpers -------------------------------------------------------------

  private clearTimer(
    name:
      | "reconnectTimer"
      | "staleTimer"
      | "proactiveReconnectTimer"
      | "dbPersistTimer"
      | "historyPersistTimer"
      | "sseBroadcastTimer"
  ): void {
    const timer = this[name];
    if (timer !== null) {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
      clearInterval(timer as ReturnType<typeof setInterval>);
      this[name] = null;
    }
  }

  private clearAllTimers(): void {
    this.clearTimer("reconnectTimer");
    this.clearTimer("staleTimer");
    this.clearTimer("proactiveReconnectTimer");
    this.clearTimer("dbPersistTimer");
    this.clearTimer("historyPersistTimer");
    this.clearTimer("sseBroadcastTimer");
  }
}

// ---------------------------------------------------------------------------
// Singleton on globalThis
// ---------------------------------------------------------------------------

type WsGlobal = typeof globalThis & {
  __binanceWsManager?: BinanceWebSocketManager;
};

const wsGlobal = globalThis as WsGlobal;

export function getBinanceWsManager(): BinanceWebSocketManager | undefined {
  return wsGlobal.__binanceWsManager;
}

/**
 * Initialize the Binance WebSocket manager.
 * Reads tracked tokens from the DB, resolves Binance symbols, and starts streaming.
 */
export async function startBinanceWebSocket(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  if (wsGlobal.__binanceWsManager) return; // already running

  const allPrices = await db
    .select({
      coingeckoId: schema.prices.coingeckoId,
      symbol: schema.prices.symbol,
      priceUsd: schema.prices.priceUsd,
      change24h: schema.prices.change24h,
      updatedAt: schema.prices.updatedAt,
    })
    .from(schema.prices);

  const binanceSymbols: string[] = [];
  const nonBinanceRows: {
    coingeckoId: string;
    priceUsd: number;
    change24h: number | null;
    updatedAt: Date;
  }[] = [];

  for (const row of allPrices) {
    const symbol = resolveBinanceSymbol(row.coingeckoId, row.symbol);
    const isBinance = symbol && COINGECKO_TO_BINANCE_SYMBOL[row.coingeckoId];
    if (isBinance && symbol) {
      binanceSymbols.push(symbol);
    } else {
      nonBinanceRows.push({
        coingeckoId: row.coingeckoId,
        priceUsd: row.priceUsd,
        change24h: row.change24h,
        updatedAt: row.updatedAt,
      });
    }
  }

  if (binanceSymbols.length === 0) {
    console.log("[binance-ws] No Binance-eligible symbols found, skipping WebSocket");
    return;
  }

  const manager = new BinanceWebSocketManager();
  wsGlobal.__binanceWsManager = manager;

  // Pre-populate non-Binance prices so SSE delivers complete data
  manager.mergeNonBinancePrices(nonBinanceRows);
  manager.start(binanceSymbols);
}
