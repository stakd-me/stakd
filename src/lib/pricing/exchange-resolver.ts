import { db, schema } from "@/lib/db";
import { inArray, sql } from "drizzle-orm";
import { fetchBinancePrices } from "./binance";
import { fetchSecondaryExchangePrices } from "./secondary-exchanges";
import { COINGECKO_TO_BINANCE_SYMBOL } from "./binance-symbol-resolver";

export type ExchangeName = "binance" | "okx" | "bybit" | "mexc" | "gate" | "none";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export interface ExchangeResolution {
  coingeckoId: string;
  symbol: string;
  exchange: ExchangeName;
}

/**
 * Resolve which exchange carries each token's USDT pair.
 * Priority: curated map → Binance REST → OKX → Bybit → MEXC → Gate.io
 * Results are cached in the `exchange_cache` table.
 */
export async function resolveTokenExchanges(
  tokens: { coingeckoId: string; symbol: string }[]
): Promise<ExchangeResolution[]> {
  if (tokens.length === 0) return [];

  const ids = tokens.map((t) => t.coingeckoId);

  // 1. Read cached resolutions
  const cached = await db
    .select()
    .from(schema.exchangeCache)
    .where(inArray(schema.exchangeCache.coingeckoId, ids));

  const cachedMap = new Map(cached.map((r) => [r.coingeckoId, r]));
  const results: ExchangeResolution[] = [];
  const uncached: { coingeckoId: string; symbol: string }[] = [];

  const now = Date.now();
  for (const token of tokens) {
    const hit = cachedMap.get(token.coingeckoId);
    if (hit) {
      const age = now - new Date(hit.resolvedAt).getTime();
      const expired = age > CACHE_TTL_MS;
      // Re-resolve if: cache expired, or "none" for a known Binance token
      const curatedSymbol = COINGECKO_TO_BINANCE_SYMBOL[token.coingeckoId];
      if (expired || (hit.exchange === "none" && curatedSymbol)) {
        uncached.push(token);
      } else {
        results.push({
          coingeckoId: hit.coingeckoId,
          symbol: hit.symbol,
          exchange: hit.exchange as ExchangeName,
        });
      }
    } else {
      uncached.push(token);
    }
  }

  if (uncached.length === 0) return results;

  // 2. Resolve uncached tokens against live exchange data
  const [binancePrices, secondaryPrices] = await Promise.all([
    fetchBinancePrices(),
    fetchSecondaryExchangePrices(),
  ]);

  const newResolutions: ExchangeResolution[] = [];

  for (const token of uncached) {
    // Curated map takes priority (collision-safe for top assets)
    const curatedSymbol = COINGECKO_TO_BINANCE_SYMBOL[token.coingeckoId];
    const candidateSymbol = curatedSymbol ?? token.symbol.trim().toUpperCase();

    let exchange: ExchangeName = "none";
    let resolvedSymbol = candidateSymbol;

    if (candidateSymbol && binancePrices[candidateSymbol]) {
      exchange = "binance";
      resolvedSymbol = candidateSymbol;
    } else if (candidateSymbol && secondaryPrices[candidateSymbol]) {
      exchange = secondaryPrices[candidateSymbol].source;
      resolvedSymbol = candidateSymbol;
    }

    const resolution: ExchangeResolution = {
      coingeckoId: token.coingeckoId,
      symbol: resolvedSymbol,
      exchange,
    };
    newResolutions.push(resolution);
    results.push(resolution);
  }

  // 3. Persist new resolutions to cache
  if (newResolutions.length > 0) {
    try {
      await db
        .insert(schema.exchangeCache)
        .values(
          newResolutions.map((r) => ({
            coingeckoId: r.coingeckoId,
            symbol: r.symbol,
            exchange: r.exchange,
            resolvedAt: new Date(),
          }))
        )
        .onConflictDoUpdate({
            target: schema.exchangeCache.coingeckoId,
            set: {
              symbol: sql`excluded.symbol`,
              exchange: sql`excluded.exchange`,
              resolvedAt: sql`excluded.resolved_at`,
            },
          });
    } catch (err) {
      console.warn("[exchange-resolver] Failed to cache resolutions:", err);
    }
  }

  if (newResolutions.length > 0) {
    const binanceCount = newResolutions.filter((r) => r.exchange === "binance").length;
    const secondaryCount = newResolutions.filter((r) => r.exchange !== "binance" && r.exchange !== "none").length;
    const noneCount = newResolutions.filter((r) => r.exchange === "none").length;
    console.log(
      `[exchange-resolver] Resolved ${newResolutions.length} tokens: binance=${binanceCount} secondary=${secondaryCount} none=${noneCount}`
    );
  }

  return results;
}

/**
 * Invalidate cached resolution for specific tokens (e.g. when re-checking).
 */
export async function invalidateExchangeCache(coingeckoIds: string[]): Promise<void> {
  if (coingeckoIds.length === 0) return;
  await db
    .delete(schema.exchangeCache)
    .where(inArray(schema.exchangeCache.coingeckoId, coingeckoIds));
}
