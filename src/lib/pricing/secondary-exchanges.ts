export type SecondaryExchangeSource = "okx" | "bybit" | "mexc" | "gate";

export interface SecondaryExchangePrice {
  priceUsd: number;
  change24h: number;
  source: SecondaryExchangeSource;
}

type SecondaryExchangePriceMap = Record<string, SecondaryExchangePrice>;

const REQUEST_TIMEOUT_MS = 8_000;
const OKX_BASE_URL = "https://www.okx.com";
const BYBIT_BASE_URL = "https://api.bybit.com";
const MEXC_BASE_URL = "https://api.mexc.com";
const GATE_BASE_URL = "https://api.gateio.ws/api/v4";

const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}$/;

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePositive(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed == null || parsed <= 0) return null;
  return parsed;
}

function toPercentFromOpen(last: number, open: number | null): number | null {
  if (open == null || open <= 0) return null;
  return ((last - open) / open) * 100;
}

function normalizeSymbol(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(normalized)) return null;
  return normalized;
}

function normalizePairSuffix(value: string, suffix: string): string | null {
  const upper = value.trim().toUpperCase();
  if (!upper.endsWith(suffix)) return null;
  return normalizeSymbol(upper.slice(0, -suffix.length));
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

type BasicTicker = { priceUsd: number; change24h: number };

function toSecondaryPrice(
  value: BasicTicker,
  source: SecondaryExchangeSource
): SecondaryExchangePrice {
  return { ...value, source };
}

function mergeByPriority(
  maps: SecondaryExchangePriceMap[]
): SecondaryExchangePriceMap {
  const merged: SecondaryExchangePriceMap = {};
  for (const priceMap of maps) {
    for (const [symbol, value] of Object.entries(priceMap)) {
      if (!merged[symbol]) {
        merged[symbol] = value;
      }
    }
  }
  return merged;
}

type OkxTicker = {
  instId: string;
  last: string;
  open24h?: string;
};
type OkxResponse = { code: string; data?: OkxTicker[] };

function parseOkxTicker(ticker: OkxTicker): { symbol: string; value: BasicTicker } | null {
  const parts = ticker.instId.split("-");
  if (parts.length !== 2 || parts[1] !== "USDT") return null;
  const symbol = normalizeSymbol(parts[0]);
  const last = parsePositive(ticker.last);
  if (!symbol || last == null) return null;

  const open24h = parsePositive(ticker.open24h);
  const change24h = toPercentFromOpen(last, open24h) ?? 0;
  return { symbol, value: { priceUsd: last, change24h } };
}

async function fetchOkxPrices(): Promise<SecondaryExchangePriceMap> {
  const payload = await fetchJson<OkxResponse>(
    `${OKX_BASE_URL}/api/v5/market/tickers?instType=SPOT`
  );
  if (!payload || payload.code !== "0" || !Array.isArray(payload.data)) return {};

  const result: SecondaryExchangePriceMap = {};
  for (const ticker of payload.data) {
    const parsed = parseOkxTicker(ticker);
    if (parsed) {
      result[parsed.symbol] = toSecondaryPrice(parsed.value, "okx");
    }
  }
  result.USDT = { priceUsd: 1, change24h: 0, source: "okx" };
  return result;
}

async function fetchOkxSinglePrice(symbol: string): Promise<SecondaryExchangePrice | null> {
  const payload = await fetchJson<OkxResponse>(
    `${OKX_BASE_URL}/api/v5/market/ticker?instId=${encodeURIComponent(`${symbol}-USDT`)}`
  );
  if (!payload || payload.code !== "0" || !Array.isArray(payload.data) || payload.data.length === 0) {
    return null;
  }
  const parsed = parseOkxTicker(payload.data[0]);
  if (!parsed || parsed.symbol !== symbol) return null;
  return toSecondaryPrice(parsed.value, "okx");
}

type BybitTicker = {
  symbol: string;
  lastPrice: string;
  prevPrice24h?: string;
  price24hPcnt?: string;
};
type BybitResponse = {
  retCode: number;
  result?: { list?: BybitTicker[] };
};

function parseBybitTicker(
  ticker: BybitTicker
): { symbol: string; value: BasicTicker } | null {
  const symbol = normalizePairSuffix(ticker.symbol, "USDT");
  const last = parsePositive(ticker.lastPrice);
  if (!symbol || last == null) return null;

  const prev = parsePositive(ticker.prevPrice24h);
  const ratio = parseNumber(ticker.price24hPcnt);
  const change24h =
    toPercentFromOpen(last, prev) ??
    (ratio == null ? 0 : ratio * 100);

  return { symbol, value: { priceUsd: last, change24h } };
}

async function fetchBybitPrices(): Promise<SecondaryExchangePriceMap> {
  const payload = await fetchJson<BybitResponse>(
    `${BYBIT_BASE_URL}/v5/market/tickers?category=spot`
  );
  const list = payload?.result?.list;
  if (!payload || payload.retCode !== 0 || !Array.isArray(list)) return {};

  const result: SecondaryExchangePriceMap = {};
  for (const ticker of list) {
    const parsed = parseBybitTicker(ticker);
    if (parsed) {
      result[parsed.symbol] = toSecondaryPrice(parsed.value, "bybit");
    }
  }
  result.USDT = { priceUsd: 1, change24h: 0, source: "bybit" };
  return result;
}

async function fetchBybitSinglePrice(
  symbol: string
): Promise<SecondaryExchangePrice | null> {
  const payload = await fetchJson<BybitResponse>(
    `${BYBIT_BASE_URL}/v5/market/tickers?category=spot&symbol=${encodeURIComponent(`${symbol}USDT`)}`
  );
  const list = payload?.result?.list;
  if (!payload || payload.retCode !== 0 || !Array.isArray(list) || list.length === 0) {
    return null;
  }
  const parsed = parseBybitTicker(list[0]);
  if (!parsed || parsed.symbol !== symbol) return null;
  return toSecondaryPrice(parsed.value, "bybit");
}

type MexcTicker = {
  symbol: string;
  lastPrice: string;
  openPrice?: string;
  prevClosePrice?: string;
  priceChangePercent?: string;
};
type MexcPayload = MexcTicker | MexcTicker[];

function parseMexcTicker(ticker: MexcTicker): { symbol: string; value: BasicTicker } | null {
  const symbol = normalizePairSuffix(ticker.symbol, "USDT");
  const last = parsePositive(ticker.lastPrice);
  if (!symbol || last == null) return null;

  const openPrice = parsePositive(ticker.openPrice);
  const prevClose = parsePositive(ticker.prevClosePrice);
  const pctField = parseNumber(ticker.priceChangePercent);
  const change24h =
    toPercentFromOpen(last, openPrice ?? prevClose) ??
    (pctField == null ? 0 : pctField * 100);

  return { symbol, value: { priceUsd: last, change24h } };
}

async function fetchMexcPrices(): Promise<SecondaryExchangePriceMap> {
  const payload = await fetchJson<MexcPayload>(`${MEXC_BASE_URL}/api/v3/ticker/24hr`);
  const list = Array.isArray(payload) ? payload : [];
  if (list.length === 0) return {};

  const result: SecondaryExchangePriceMap = {};
  for (const ticker of list) {
    const parsed = parseMexcTicker(ticker);
    if (parsed) {
      result[parsed.symbol] = toSecondaryPrice(parsed.value, "mexc");
    }
  }
  result.USDT = { priceUsd: 1, change24h: 0, source: "mexc" };
  return result;
}

async function fetchMexcSinglePrice(
  symbol: string
): Promise<SecondaryExchangePrice | null> {
  const payload = await fetchJson<MexcPayload>(
    `${MEXC_BASE_URL}/api/v3/ticker/24hr?symbol=${encodeURIComponent(`${symbol}USDT`)}`
  );
  if (!payload || Array.isArray(payload)) return null;
  const parsed = parseMexcTicker(payload);
  if (!parsed || parsed.symbol !== symbol) return null;
  return toSecondaryPrice(parsed.value, "mexc");
}

type GateTicker = {
  currency_pair: string;
  last: string;
  change_percentage?: string;
};
type GatePayload = GateTicker[];

function parseGateTicker(ticker: GateTicker): { symbol: string; value: BasicTicker } | null {
  const [base, quote] = ticker.currency_pair.split("_");
  if (quote !== "USDT") return null;
  const symbol = normalizeSymbol(base);
  const last = parsePositive(ticker.last);
  if (!symbol || last == null) return null;

  const change24h = parseNumber(ticker.change_percentage) ?? 0;
  return { symbol, value: { priceUsd: last, change24h } };
}

async function fetchGatePrices(): Promise<SecondaryExchangePriceMap> {
  const payload = await fetchJson<GatePayload>(`${GATE_BASE_URL}/spot/tickers`);
  if (!Array.isArray(payload) || payload.length === 0) return {};

  const result: SecondaryExchangePriceMap = {};
  for (const ticker of payload) {
    const parsed = parseGateTicker(ticker);
    if (parsed) {
      result[parsed.symbol] = toSecondaryPrice(parsed.value, "gate");
    }
  }
  result.USDT = { priceUsd: 1, change24h: 0, source: "gate" };
  return result;
}

async function fetchGateSinglePrice(
  symbol: string
): Promise<SecondaryExchangePrice | null> {
  const payload = await fetchJson<GatePayload>(
    `${GATE_BASE_URL}/spot/tickers?currency_pair=${encodeURIComponent(`${symbol}_USDT`)}`
  );
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const parsed = parseGateTicker(payload[0]);
  if (!parsed || parsed.symbol !== symbol) return null;
  return toSecondaryPrice(parsed.value, "gate");
}

export async function fetchSecondaryExchangePrices(): Promise<SecondaryExchangePriceMap> {
  const [okx, bybit, mexc, gate] = await Promise.all([
    fetchOkxPrices(),
    fetchBybitPrices(),
    fetchMexcPrices(),
    fetchGatePrices(),
  ]);

  // Priority after Binance: OKX -> Bybit -> MEXC -> Gate.
  return mergeByPriority([okx, bybit, mexc, gate]);
}

export async function fetchSecondarySinglePrice(
  symbol: string
): Promise<SecondaryExchangePrice | null> {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) return null;

  const [okx, bybit, mexc, gate] = await Promise.all([
    fetchOkxSinglePrice(normalizedSymbol),
    fetchBybitSinglePrice(normalizedSymbol),
    fetchMexcSinglePrice(normalizedSymbol),
    fetchGateSinglePrice(normalizedSymbol),
  ]);

  return okx || bybit || mexc || gate || null;
}
