import { db, schema } from "@/lib/db";
import { and, gte, inArray } from "drizzle-orm";
import { getPrice } from "./coingecko";
import { fetchBinancePrices } from "./binance";
import {
  COINGECKO_FALLBACK_FETCHES_PER_DAY,
  splitByCoinGeckoCooldown,
} from "./coingecko-fallback";
import { resolveBinanceSymbol } from "./binance-symbol-resolver";
import { fetchSecondaryExchangePrices } from "./secondary-exchanges";

/**
 * Refreshes prices for all tokens in the prices table.
 * Uses Binance as primary source, then other CEXs, then CoinGecko fallback.
 */
export async function refreshAllPrices(priceSource: string = "binance"): Promise<void> {
  const allPrices = await db.select().from(schema.prices);
  if (allPrices.length === 0) return;

  const symbolLookup: Record<string, string> = {};
  const uniqueIds = new Set<string>();

  for (const p of allPrices) {
    const id = p.coingeckoId.trim().toLowerCase();
    uniqueIds.add(id);
    symbolLookup[id] = p.symbol.trim().toUpperCase();
  }

  const now = new Date();
  const ids = Array.from(uniqueIds);

  if (priceSource === "binance") {
    const binancePrices = await fetchBinancePrices();
    const secondaryExchangeFallbackIds: string[] = [];

    for (const coingeckoId of ids) {
      const symbol = resolveBinanceSymbol(coingeckoId, symbolLookup[coingeckoId]);
      const binanceData = symbol ? binancePrices[symbol] : undefined;

      if (symbol && binanceData) {
        await db
          .insert(schema.prices)
          .values({
            coingeckoId,
            symbol,
            priceUsd: binanceData.priceUsd,
            change24h: binanceData.change24h,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.prices.coingeckoId,
            set: {
              priceUsd: binanceData.priceUsd,
              change24h: binanceData.change24h,
              symbol,
              updatedAt: now,
            },
          });

        await db.insert(schema.priceHistory).values({
          coingeckoId,
          priceUsd: binanceData.priceUsd,
        });
      } else {
        secondaryExchangeFallbackIds.push(coingeckoId);
      }
    }

    const coingeckoFallbackIds: string[] = [];
    if (secondaryExchangeFallbackIds.length > 0) {
      const secondaryPrices = await fetchSecondaryExchangePrices();

      for (const coingeckoId of secondaryExchangeFallbackIds) {
        const symbol = resolveBinanceSymbol(coingeckoId, symbolLookup[coingeckoId]);
        const secondaryData = symbol ? secondaryPrices[symbol] : undefined;

        if (symbol && secondaryData) {
          await db
            .insert(schema.prices)
            .values({
              coingeckoId,
              symbol,
              priceUsd: secondaryData.priceUsd,
              change24h: secondaryData.change24h,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: schema.prices.coingeckoId,
              set: {
                priceUsd: secondaryData.priceUsd,
                change24h: secondaryData.change24h,
                symbol,
                updatedAt: now,
              },
            });

          await db.insert(schema.priceHistory).values({
            coingeckoId,
            priceUsd: secondaryData.priceUsd,
          });
        } else {
          coingeckoFallbackIds.push(coingeckoId);
        }
      }
    }

    // CoinGecko fallback
    if (coingeckoFallbackIds.length > 0) {
      const { allowed, blocked } = await splitByCoinGeckoCooldown(coingeckoFallbackIds);
      if (blocked.length > 0) {
        console.info(
          `[pricing] Skipped ${blocked.length} CoinGecko fallback tokens (cooldown: ${COINGECKO_FALLBACK_FETCHES_PER_DAY}x/day)`
        );
      }
      if (allowed.length > 0) {
        await refreshFromCoinGecko(allowed, symbolLookup, now);
      }
    }
  } else {
    await refreshFromCoinGecko(ids, symbolLookup, now);
  }
}

async function refreshFromCoinGecko(
  ids: string[],
  symbolLookup: Record<string, string>,
  now: Date
): Promise<void> {
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const priceData = await getPrice(batch);

    for (const [coingeckoId, data] of Object.entries(priceData)) {
      const symbol = symbolLookup[coingeckoId] || coingeckoId;

      await db
        .insert(schema.prices)
        .values({
          coingeckoId,
          symbol,
          priceUsd: data.usd,
          change24h: data.usd_24h_change,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.prices.coingeckoId,
          set: {
            priceUsd: data.usd,
            change24h: data.usd_24h_change,
            symbol,
            updatedAt: now,
          },
        });

      await db.insert(schema.priceHistory).values({
        coingeckoId,
        priceUsd: data.usd,
      });
    }
  }
}

/**
 * Ensure specific tokens exist in the price cache.
 * Adds them if missing, tries Binance first, then other CEXs, then CoinGecko fallback.
 * If CoinGecko is rate-limited, inserts a placeholder row (price 0)
 * so the token gets updated on the next refresh cycle.
 */
export async function ensurePricesExist(
  tokens: { coingeckoId: string; symbol: string }[]
): Promise<void> {
  const normalizedTokens = Array.from(
    tokens.reduce((acc, token) => {
      const coingeckoId = token.coingeckoId?.trim().toLowerCase();
      const symbol = token.symbol?.trim().toUpperCase();
      if (coingeckoId && symbol) {
        acc.set(coingeckoId, { coingeckoId, symbol });
      }
      return acc;
    }, new Map<string, { coingeckoId: string; symbol: string }>())
      .values()
  );

  if (normalizedTokens.length === 0) return;

  const ids = normalizedTokens.map((t) => t.coingeckoId);
  const existingRows = await db
    .select({ coingeckoId: schema.prices.coingeckoId })
    .from(schema.prices)
    .where(inArray(schema.prices.coingeckoId, ids));

  const existingIds = new Set(existingRows.map((r) => r.coingeckoId));
  const missing = normalizedTokens.filter((t) => !existingIds.has(t.coingeckoId));

  if (missing.length === 0) return;

  const now = new Date();
  const binancePrices = await fetchBinancePrices();
  const missingOnBinance: { coingeckoId: string; symbol: string }[] = [];

  for (const token of missing) {
    const resolvedBinanceSymbol = resolveBinanceSymbol(
      token.coingeckoId,
      token.symbol
    );
    const binanceData = resolvedBinanceSymbol
      ? binancePrices[resolvedBinanceSymbol]
      : undefined;
    if (!resolvedBinanceSymbol || !binanceData) {
      missingOnBinance.push(token);
      continue;
    }

    await db
      .insert(schema.prices)
      .values({
        coingeckoId: token.coingeckoId,
        symbol: resolvedBinanceSymbol,
        priceUsd: binanceData.priceUsd,
        change24h: binanceData.change24h,
        updatedAt: now,
      })
      .onConflictDoNothing();

    await db.insert(schema.priceHistory).values({
      coingeckoId: token.coingeckoId,
      priceUsd: binanceData.priceUsd,
    });
  }

  if (missingOnBinance.length === 0) return;

  const secondaryPrices = await fetchSecondaryExchangePrices();
  const missingOnSecondaryExchanges: { coingeckoId: string; symbol: string }[] = [];

  for (const token of missingOnBinance) {
    const resolvedSymbol = resolveBinanceSymbol(token.coingeckoId, token.symbol);
    const secondaryData = resolvedSymbol ? secondaryPrices[resolvedSymbol] : undefined;

    if (!resolvedSymbol || !secondaryData) {
      missingOnSecondaryExchanges.push(token);
      continue;
    }

    await db
      .insert(schema.prices)
      .values({
        coingeckoId: token.coingeckoId,
        symbol: resolvedSymbol,
        priceUsd: secondaryData.priceUsd,
        change24h: secondaryData.change24h,
        updatedAt: now,
      })
      .onConflictDoNothing();

    await db.insert(schema.priceHistory).values({
      coingeckoId: token.coingeckoId,
      priceUsd: secondaryData.priceUsd,
    });
  }

  if (missingOnSecondaryExchanges.length === 0) return;
  const fallbackIds = missingOnSecondaryExchanges.map((t) => t.coingeckoId);
  const { allowed, blocked } = await splitByCoinGeckoCooldown(fallbackIds);

  let priceData: Record<string, { usd: number; usd_24h_change: number }> = {};
  if (allowed.length > 0) {
    try {
      priceData = await getPrice(allowed);
    } catch (err) {
      // CoinGecko rate-limited or down — insert placeholders so next refresh picks them up
      console.warn("[ensurePricesExist] CoinGecko fetch failed, inserting placeholders:", err instanceof Error ? err.message : String(err));
    }
  }
  if (blocked.length > 0) {
    console.info(
      `[ensurePricesExist] Skipped ${blocked.length} CoinGecko fetches due to cooldown (${COINGECKO_FALLBACK_FETCHES_PER_DAY}x/day)`
    );
  }
  const blockedSet = new Set(blocked);

  for (const token of missingOnSecondaryExchanges) {
    const data = priceData[token.coingeckoId];
    const shouldUsePlaceholder = blockedSet.has(token.coingeckoId) || !data;
    await db
      .insert(schema.prices)
      .values({
        coingeckoId: token.coingeckoId,
        symbol: token.symbol,
        priceUsd: shouldUsePlaceholder ? 0 : data.usd,
        change24h: shouldUsePlaceholder ? null : data.usd_24h_change,
        updatedAt: now,
      })
      .onConflictDoNothing();

    if (!shouldUsePlaceholder) {
      await db.insert(schema.priceHistory).values({
        coingeckoId: token.coingeckoId,
        priceUsd: data.usd,
      });
    }
  }
}

/**
 * Get all cached prices.
 */
export async function getAllPrices(): Promise<
  Record<string, { symbol: string; usd: number; change24h: number | null; updatedAt: Date }>
> {
  const rows = await db.select().from(schema.prices);
  const result: Record<string, { symbol: string; usd: number; change24h: number | null; updatedAt: Date }> = {};
  for (const row of rows) {
    result[row.coingeckoId] = {
      symbol: row.symbol,
      usd: row.priceUsd,
      change24h: row.change24h,
      updatedAt: row.updatedAt,
    };
  }
  return result;
}

/**
 * Compute annualized volatility for tokens with price history.
 */
export async function computeTokenVolatilities(
  lookbackDays: number,
  coingeckoIds?: string[]
): Promise<Record<string, { volatility: number; dataPoints: number }>> {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const filteredIds = (coingeckoIds || []).filter((value) => value.trim().length > 0);
  const whereClause = filteredIds.length > 0
    ? and(
        gte(schema.priceHistory.recordedAt, cutoff),
        inArray(schema.priceHistory.coingeckoId, filteredIds)
      )
    : gte(schema.priceHistory.recordedAt, cutoff);

  const rows = await db
    .select({
      coingeckoId: schema.priceHistory.coingeckoId,
      priceUsd: schema.priceHistory.priceUsd,
      recordedAt: schema.priceHistory.recordedAt,
    })
    .from(schema.priceHistory)
    .where(whereClause)
    .orderBy(schema.priceHistory.coingeckoId, schema.priceHistory.recordedAt);

  const grouped: Record<string, number[]> = {};
  for (const row of rows) {
    if (!grouped[row.coingeckoId]) grouped[row.coingeckoId] = [];
    grouped[row.coingeckoId].push(row.priceUsd);
  }

  const result: Record<string, { volatility: number; dataPoints: number }> = {};

  for (const [id, prices] of Object.entries(grouped)) {
    if (prices.length < 2) {
      result[id] = { volatility: 0, dataPoints: prices.length };
      continue;
    }

    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }

    if (returns.length === 0) {
      result[id] = { volatility: 0, dataPoints: prices.length };
      continue;
    }

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance =
      returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    const dailyStdDev = Math.sqrt(variance);
    const annualizedVol = dailyStdDev * Math.sqrt(365);

    result[id] = { volatility: annualizedVol, dataPoints: prices.length };
  }

  return result;
}
