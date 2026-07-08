import type { PriceData } from "@/lib/services/portfolio-calculator";
import { COINGECKO_TO_BINANCE_SYMBOL } from "@/lib/pricing/binance-symbol-resolver";
import { normalizeCoingeckoId, normalizeSymbol } from "@/lib/asset-key";

export type PriceMap = Record<string, PriceData>;

export interface PriceEntry {
  coingeckoId: string;
  symbol?: string | null;
  usd: number;
  change24h: number | null;
  updatedAt: string | null;
}

/**
 * Merge price entries into a (dual-keyed) price map. This is the ONLY place
 * that decides how prices are keyed — the REST snapshot and the SSE stream
 * must both go through it so the two transports can never diverge (the
 * historic source of stale/wrong-price bugs).
 *
 * Keys: coingeckoId always; uppercase symbol as an alias when the entry
 * carries one (REST rows do) or the curated Binance map knows it (SSE
 * entries). The symbol alias is re-pointed on every update so the
 * exchange-first lookup in `lookupPrice` always sees the latest price.
 */
export function mergePriceEntries(
  prev: PriceMap | undefined,
  entries: PriceEntry[]
): PriceMap {
  const map: PriceMap = { ...prev };

  for (const entry of entries) {
    const id = normalizeCoingeckoId(entry.coingeckoId);
    if (!id) continue;

    const priceData: PriceData = {
      usd: entry.usd,
      change24h: entry.change24h,
      updatedAt: entry.updatedAt,
    };

    const previous = map[id];
    map[id] = priceData;

    const symbol =
      normalizeSymbol(entry.symbol) || COINGECKO_TO_BINANCE_SYMBOL[id] || "";
    if (symbol) {
      map[symbol] = priceData;
    } else if (previous) {
      // The entry doesn't name its symbol (SSE ticks for non-curated coins).
      // Re-point any existing symbol alias of this coin at the fresh data so
      // symbol-first lookups never see a stale price.
      for (const key of Object.keys(map)) {
        if (key !== id && map[key] === previous) map[key] = priceData;
      }
    }
  }

  return map;
}

/**
 * Price lookup for a holding. Symbol (exchange) key first — Binance/OKX/
 * Bybit/MEXC/Gate live feeds have priority — then coingeckoId (CoinGecko)
 * as the fallback for long-tail tokens no exchange carries.
 * mergePriceEntries keeps the symbol alias in sync with every update, so
 * symbol-first can't return a stale price.
 */
export function lookupPrice(
  priceMap: PriceMap,
  symbol: string | null | undefined,
  coingeckoId: string | null | undefined
): PriceData | null {
  const upper = normalizeSymbol(symbol);
  if (upper && priceMap[upper]) return priceMap[upper];

  const id = normalizeCoingeckoId(coingeckoId);
  if (id && priceMap[id]) return priceMap[id];

  return null;
}
