import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WsPriceUpdate {
  coingeckoId: string;
  priceUsd: number;
  change24h: number | null;
}

export type OnPriceCallback = (update: WsPriceUpdate) => void;

// ---------------------------------------------------------------------------
// Base class with shared reconnection / heartbeat logic
// ---------------------------------------------------------------------------

abstract class BaseExchangeWs {
  protected ws: WebSocket | null = null;
  protected symbols = new Map<string, string>(); // EXCHANGE_PAIR -> coingeckoId
  protected onPrice: OnPriceCallback;
  protected stopped = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  abstract readonly name: string;
  protected abstract wsUrl(): string;
  protected abstract buildSubscribeMessage(pairs: string[]): unknown;
  protected abstract parseMessage(data: string): WsPriceUpdate | null;
  protected abstract heartbeatMessage(): unknown | null;
  protected abstract heartbeatIntervalMs(): number;
  protected abstract formatPair(symbol: string): string;

  constructor(onPrice: OnPriceCallback) {
    this.onPrice = onPrice;
  }

  start(entries: { symbol: string; coingeckoId: string }[]): void {
    this.stopped = false;
    for (const e of entries) {
      const pair = this.formatPair(e.symbol);
      this.symbols.set(pair, e.coingeckoId);
    }
    if (this.symbols.size === 0) return;
    this.connect();
  }

  subscribe(entries: { symbol: string; coingeckoId: string }[]): void {
    const newPairs: string[] = [];
    for (const e of entries) {
      const pair = this.formatPair(e.symbol);
      if (!this.symbols.has(pair)) {
        this.symbols.set(pair, e.coingeckoId);
        newPairs.push(pair);
      }
    }
    if (newPairs.length === 0) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.buildSubscribeMessage(newPairs);
      if (msg) this.ws.send(JSON.stringify(msg));
      console.log(`[${this.name}-ws] Subscribed to ${newPairs.length} new symbols`);
    }
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.stopped || this.symbols.size === 0) return;

    const url = this.wsUrl();
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error(`[${this.name}-ws] Failed to create WebSocket:`, err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      console.log(`[${this.name}-ws] Connected, streaming ${this.symbols.size} symbols`);
      this.reconnectAttempts = 0;

      // Subscribe to all symbols
      const pairs = Array.from(this.symbols.keys());
      const msg = this.buildSubscribeMessage(pairs);
      if (msg) this.ws!.send(JSON.stringify(msg));

      this.startHeartbeat();
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      try {
        const update = this.parseMessage(data.toString());
        if (update) this.onPrice(update);
      } catch {
        // ignore parse errors
      }
    });

    this.ws.on("close", () => {
      console.warn(`[${this.name}-ws] Connection closed`);
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error(`[${this.name}-ws] Error:`, err.message);
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.clearTimers();
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.close();
        this.ws = null;
      }
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    const interval = this.heartbeatIntervalMs();
    const msg = this.heartbeatMessage();
    if (!msg || interval <= 0) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
    }, interval);
    if (typeof this.heartbeatTimer === "object" && "unref" in this.heartbeatTimer) {
      this.heartbeatTimer.unref();
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// OKX WebSocket
// ---------------------------------------------------------------------------

export class OkxWs extends BaseExchangeWs {
  readonly name = "okx";

  protected wsUrl() {
    return "wss://ws.okx.com:8443/ws/v5/public";
  }

  protected formatPair(symbol: string) {
    return `${symbol.toUpperCase()}-USDT`;
  }

  protected buildSubscribeMessage(pairs: string[]) {
    return {
      op: "subscribe",
      args: pairs.map((p) => ({ channel: "tickers", instId: p })),
    };
  }

  protected heartbeatMessage() {
    return "ping";
  }

  protected heartbeatIntervalMs() {
    return 25_000;
  }

  protected parseMessage(data: string): WsPriceUpdate | null {
    if (data === "pong") return null;
    const msg = JSON.parse(data);
    if (!msg?.data?.[0]) return null;
    const ticker = msg.data[0];
    const instId = ticker.instId ?? msg.arg?.instId;
    if (!instId) return null;

    const coingeckoId = this.symbols.get(instId);
    if (!coingeckoId) return null;

    const price = parseFloat(ticker.last);
    if (!Number.isFinite(price) || price <= 0) return null;

    const open = parseFloat(ticker.open24h);
    const change24h =
      Number.isFinite(open) && open > 0
        ? ((price - open) / open) * 100
        : null;

    return { coingeckoId, priceUsd: price, change24h };
  }
}

// ---------------------------------------------------------------------------
// Bybit WebSocket
// ---------------------------------------------------------------------------

export class BybitWs extends BaseExchangeWs {
  readonly name = "bybit";

  protected wsUrl() {
    return "wss://stream.bybit.com/v5/public/spot";
  }

  protected formatPair(symbol: string) {
    return `${symbol.toUpperCase()}USDT`;
  }

  protected buildSubscribeMessage(pairs: string[]) {
    return {
      op: "subscribe",
      args: pairs.map((p) => `tickers.${p}`),
    };
  }

  protected heartbeatMessage() {
    return { op: "ping" };
  }

  protected heartbeatIntervalMs() {
    return 18_000;
  }

  protected parseMessage(data: string): WsPriceUpdate | null {
    const msg = JSON.parse(data);
    if (!msg?.topic?.startsWith("tickers.") || !msg.data) return null;

    const pair = msg.topic.slice("tickers.".length);
    const coingeckoId = this.symbols.get(pair);
    if (!coingeckoId) return null;

    const price = parseFloat(msg.data.lastPrice);
    if (!Number.isFinite(price) || price <= 0) return null;

    const prev = parseFloat(msg.data.prevPrice24h);
    const change24h =
      Number.isFinite(prev) && prev > 0
        ? ((price - prev) / prev) * 100
        : null;

    return { coingeckoId, priceUsd: price, change24h };
  }
}

// ---------------------------------------------------------------------------
// MEXC WebSocket
// ---------------------------------------------------------------------------

export class MexcWs extends BaseExchangeWs {
  readonly name = "mexc";

  protected wsUrl() {
    return "wss://wbs.mexc.com/ws";
  }

  protected formatPair(symbol: string) {
    return `${symbol.toUpperCase()}USDT`;
  }

  protected buildSubscribeMessage(pairs: string[]) {
    return {
      method: "SUBSCRIPTION",
      params: pairs.map((p) => `spot@public.miniTicker.v3.api@${p}`),
    };
  }

  protected heartbeatMessage() {
    return { method: "PING" };
  }

  protected heartbeatIntervalMs() {
    return 15_000;
  }

  protected parseMessage(data: string): WsPriceUpdate | null {
    const msg = JSON.parse(data);
    // MEXC mini ticker: { c: "spot@public.miniTicker.v3.api@TAOUSDT", d: { s: "TAOUSDT", p: "300.5", r: "0.035" } }
    if (!msg?.d?.s || !msg?.d?.p) return null;

    const pair = msg.d.s;
    const coingeckoId = this.symbols.get(pair);
    if (!coingeckoId) return null;

    const price = parseFloat(msg.d.p);
    if (!Number.isFinite(price) || price <= 0) return null;

    // r is ratio (e.g. 0.035 = 3.5%)
    const ratio = parseFloat(msg.d.r);
    const change24h = Number.isFinite(ratio) ? ratio * 100 : null;

    return { coingeckoId, priceUsd: price, change24h };
  }
}

// ---------------------------------------------------------------------------
// Gate.io WebSocket
// ---------------------------------------------------------------------------

export class GateWs extends BaseExchangeWs {
  readonly name = "gate";

  protected wsUrl() {
    return "wss://api.gateio.ws/ws/v4/";
  }

  protected formatPair(symbol: string) {
    return `${symbol.toUpperCase()}_USDT`;
  }

  protected buildSubscribeMessage(pairs: string[]) {
    return {
      time: Math.floor(Date.now() / 1000),
      channel: "spot.tickers",
      event: "subscribe",
      payload: pairs,
    };
  }

  protected heartbeatMessage() {
    return null; // Gate.io uses standard WS ping/pong frames
  }

  protected heartbeatIntervalMs() {
    return 0;
  }

  protected parseMessage(data: string): WsPriceUpdate | null {
    const msg = JSON.parse(data);
    if (msg?.channel !== "spot.tickers" || msg?.event !== "update") return null;
    const result = msg.result;
    if (!result?.currency_pair || !result?.last) return null;

    const coingeckoId = this.symbols.get(result.currency_pair);
    if (!coingeckoId) return null;

    const price = parseFloat(result.last);
    if (!Number.isFinite(price) || price <= 0) return null;

    const changePct = parseFloat(result.change_percentage);
    const change24h = Number.isFinite(changePct) ? changePct : null;

    return { coingeckoId, priceUsd: price, change24h };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type SecondaryWsExchange = "okx" | "bybit" | "mexc" | "gate";

export function createSecondaryWs(
  exchange: SecondaryWsExchange,
  onPrice: OnPriceCallback
): BaseExchangeWs {
  switch (exchange) {
    case "okx":
      return new OkxWs(onPrice);
    case "bybit":
      return new BybitWs(onPrice);
    case "mexc":
      return new MexcWs(onPrice);
    case "gate":
      return new GateWs(onPrice);
  }
}
