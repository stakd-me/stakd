const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/24hr";
const TIMEOUT_MS = 15_000;

export interface BinancePrice {
  priceUsd: number;
  change24h: number;
}

/**
 * Fetches all USDT-pair tickers from Binance public API in a single call.
 * Returns a map of uppercase symbol -> { priceUsd, change24h }.
 * On any error, returns {} so CoinGecko fallback kicks in.
 */
export async function fetchBinancePrices(): Promise<Record<string, BinancePrice>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(BINANCE_TICKER_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[binance] HTTP ${response.status} — falling back to CoinGecko`);
      return {};
    }

    const tickers: {
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
    }[] = await response.json();

    const result: Record<string, BinancePrice> = {};

    for (const t of tickers) {
      if (!t.symbol.endsWith("USDT")) continue;
      const base = t.symbol.slice(0, -4); // strip "USDT"
      if (!base) continue;
      const price = parseFloat(t.lastPrice);
      const change = parseFloat(t.priceChangePercent);
      if (isNaN(price) || price <= 0) continue;
      result[base] = { priceUsd: price, change24h: isNaN(change) ? 0 : change };
    }

    // Hardcode USDT = $1
    result["USDT"] = { priceUsd: 1, change24h: 0 };

    return result;
  } catch (error) {
    console.warn(
      "[binance] Failed to fetch prices:",
      error instanceof Error ? error.message : String(error)
    );
    return {};
  }
}

/**
 * Fetches the current price for a single symbol from Binance (e.g. "BTC" → BTCUSDT).
 * Returns { priceUsd, change24h } or null on any error.
 * Uses a 5s timeout so CoinGecko fallback isn't delayed much.
 */
export async function fetchBinanceSinglePrice(symbol: string): Promise<BinancePrice | null> {
  try {
    const pair = `${symbol.toUpperCase()}USDT`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    const response = await fetch(
      `${BINANCE_TICKER_URL}?symbol=${pair}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data: { lastPrice: string; priceChangePercent: string } = await response.json();
    const price = parseFloat(data.lastPrice);
    const change = parseFloat(data.priceChangePercent);
    if (isNaN(price) || price <= 0) return null;

    return { priceUsd: price, change24h: isNaN(change) ? 0 : change };
  } catch {
    return null;
  }
}
