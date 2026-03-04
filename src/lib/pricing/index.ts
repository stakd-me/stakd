import { db, schema } from "@/lib/db";
import { and, gte, inArray, lt, sql } from "drizzle-orm";
import { getPrice } from "./coingecko";
import { fetchBinancePrices } from "./binance";
import {
  COINGECKO_FALLBACK_FETCHES_PER_DAY,
  splitByCoinGeckoCooldown,
} from "./coingecko-fallback";
import { resolveBinanceSymbol } from "./binance-symbol-resolver";
import { fetchSecondaryExchangePrices } from "./secondary-exchanges";

const COINGECKO_BATCH_SIZE = 50;
const DB_WRITE_BATCH_SIZE = 200;
const DEFAULT_PRICE_HISTORY_RETENTION_DAYS = 365;
const MIN_PRICE_HISTORY_RETENTION_DAYS = 7;
const MAX_PRICE_HISTORY_RETENTION_DAYS = 3650;
const PRICE_HISTORY_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

let lastPriceHistoryPruneAttemptAtMs = 0;

interface PriceWriteRow {
  coingeckoId: string;
  symbol: string;
  priceUsd: number;
  change24h: number | null;
}

interface RefreshMetrics {
  totalIds: number;
  binanceHits: number;
  secondaryHits: number;
  coingeckoRequested: number;
  coingeckoAllowed: number;
  coingeckoBlocked: number;
  coingeckoHits: number;
  priceRowsWritten: number;
  historyRowsWritten: number;
  historyRowsPruned: number;
}

export function parsePriceHistoryRetentionDays(rawValue: string | undefined): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PRICE_HISTORY_RETENTION_DAYS;
  if (parsed <= 0) return 0;
  return Math.max(
    MIN_PRICE_HISTORY_RETENTION_DAYS,
    Math.min(MAX_PRICE_HISTORY_RETENTION_DAYS, parsed)
  );
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function fetchCoinGeckoRows(
  ids: string[],
  symbolLookup: Record<string, string>
): Promise<PriceWriteRow[]> {
  const rows: PriceWriteRow[] = [];

  for (let i = 0; i < ids.length; i += COINGECKO_BATCH_SIZE) {
    const batch = ids.slice(i, i + COINGECKO_BATCH_SIZE);
    const priceData = await getPrice(batch);

    for (const [coingeckoId, data] of Object.entries(priceData)) {
      rows.push({
        coingeckoId,
        symbol: symbolLookup[coingeckoId] || coingeckoId,
        priceUsd: data.usd,
        change24h: data.usd_24h_change,
      });
    }
  }

  return rows;
}

async function persistPriceRows(
  rows: PriceWriteRow[],
  now: Date
): Promise<{ priceRowsWritten: number; historyRowsWritten: number }> {
  if (rows.length === 0) {
    return { priceRowsWritten: 0, historyRowsWritten: 0 };
  }

  for (const chunk of chunkArray(rows, DB_WRITE_BATCH_SIZE)) {
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

  for (const chunk of chunkArray(rows, DB_WRITE_BATCH_SIZE)) {
    await db.insert(schema.priceHistory).values(
      chunk.map((row) => ({
        coingeckoId: row.coingeckoId,
        priceUsd: row.priceUsd,
      }))
    );
  }

  return {
    priceRowsWritten: rows.length,
    historyRowsWritten: rows.length,
  };
}

async function prunePriceHistoryIfDue(now: Date): Promise<number> {
  const retentionDays = parsePriceHistoryRetentionDays(
    process.env.PRICE_HISTORY_RETENTION_DAYS
  );
  if (retentionDays === 0) return 0;

  const nowMs = now.getTime();
  if (nowMs - lastPriceHistoryPruneAttemptAtMs < PRICE_HISTORY_PRUNE_INTERVAL_MS) {
    return 0;
  }
  lastPriceHistoryPruneAttemptAtMs = nowMs;

  const cutoff = new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000);
  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(schema.priceHistory)
    .where(lt(schema.priceHistory.recordedAt, cutoff));
  const rowsToDelete = Number(countRow?.count ?? 0);

  if (rowsToDelete <= 0) return 0;

  await db
    .delete(schema.priceHistory)
    .where(lt(schema.priceHistory.recordedAt, cutoff));

  return rowsToDelete;
}

/**
 * Refreshes prices for all tokens in the prices table.
 * Uses Binance as primary source, then other CEXs, then CoinGecko fallback.
 */
export async function refreshAllPrices(priceSource: string = "binance"): Promise<void> {
  const startedAt = Date.now();
  const metrics: RefreshMetrics = {
    totalIds: 0,
    binanceHits: 0,
    secondaryHits: 0,
    coingeckoRequested: 0,
    coingeckoAllowed: 0,
    coingeckoBlocked: 0,
    coingeckoHits: 0,
    priceRowsWritten: 0,
    historyRowsWritten: 0,
    historyRowsPruned: 0,
  };

  try {
    const allPrices = await db
      .select({
        coingeckoId: schema.prices.coingeckoId,
        symbol: schema.prices.symbol,
      })
      .from(schema.prices);
    if (allPrices.length === 0) {
      return;
    }

    const symbolLookup: Record<string, string> = {};
    const uniqueIds = new Set<string>();

    for (const row of allPrices) {
      const id = row.coingeckoId.trim().toLowerCase();
      uniqueIds.add(id);
      symbolLookup[id] = row.symbol.trim().toUpperCase();
    }

    const rowsToPersist: PriceWriteRow[] = [];
    const now = new Date();
    const ids = Array.from(uniqueIds);
    metrics.totalIds = ids.length;

    if (priceSource === "binance") {
      const binancePrices = await fetchBinancePrices();
      const secondaryExchangeFallbackIds: string[] = [];

      for (const coingeckoId of ids) {
        const symbol = resolveBinanceSymbol(coingeckoId, symbolLookup[coingeckoId]);
        const binanceData = symbol ? binancePrices[symbol] : undefined;

        if (symbol && binanceData) {
          rowsToPersist.push({
            coingeckoId,
            symbol,
            priceUsd: binanceData.priceUsd,
            change24h: binanceData.change24h,
          });
          metrics.binanceHits += 1;
          continue;
        }

        secondaryExchangeFallbackIds.push(coingeckoId);
      }

      const coingeckoFallbackIds: string[] = [];
      if (secondaryExchangeFallbackIds.length > 0) {
        const secondaryPrices = await fetchSecondaryExchangePrices();

        for (const coingeckoId of secondaryExchangeFallbackIds) {
          const symbol = resolveBinanceSymbol(coingeckoId, symbolLookup[coingeckoId]);
          const secondaryData = symbol ? secondaryPrices[symbol] : undefined;

          if (symbol && secondaryData) {
            rowsToPersist.push({
              coingeckoId,
              symbol,
              priceUsd: secondaryData.priceUsd,
              change24h: secondaryData.change24h,
            });
            metrics.secondaryHits += 1;
            continue;
          }

          coingeckoFallbackIds.push(coingeckoId);
        }
      }

      if (coingeckoFallbackIds.length > 0) {
        metrics.coingeckoRequested += coingeckoFallbackIds.length;
        const { allowed, blocked } = await splitByCoinGeckoCooldown(
          coingeckoFallbackIds
        );

        metrics.coingeckoAllowed += allowed.length;
        metrics.coingeckoBlocked += blocked.length;
        if (blocked.length > 0) {
          console.info(
            `[pricing] Skipped ${blocked.length} CoinGecko fallback tokens (cooldown: ${COINGECKO_FALLBACK_FETCHES_PER_DAY}x/day)`
          );
        }

        if (allowed.length > 0) {
          const coingeckoRows = await fetchCoinGeckoRows(allowed, symbolLookup);
          rowsToPersist.push(...coingeckoRows);
          metrics.coingeckoHits += coingeckoRows.length;
        }
      }
    } else {
      metrics.coingeckoRequested += ids.length;
      metrics.coingeckoAllowed += ids.length;
      const coingeckoRows = await fetchCoinGeckoRows(ids, symbolLookup);
      rowsToPersist.push(...coingeckoRows);
      metrics.coingeckoHits += coingeckoRows.length;
    }

    const writeResult = await persistPriceRows(rowsToPersist, now);
    metrics.priceRowsWritten = writeResult.priceRowsWritten;
    metrics.historyRowsWritten = writeResult.historyRowsWritten;
    metrics.historyRowsPruned = await prunePriceHistoryIfDue(now);

    console.info(
      `[pricing] Refresh complete source=${priceSource} ids=${metrics.totalIds} binance=${metrics.binanceHits} secondary=${metrics.secondaryHits} coingeckoHits=${metrics.coingeckoHits}/${metrics.coingeckoAllowed} blocked=${metrics.coingeckoBlocked} wrotePrices=${metrics.priceRowsWritten} wroteHistory=${metrics.historyRowsWritten} prunedHistory=${metrics.historyRowsPruned} durationMs=${Date.now() - startedAt}`
    );
  } catch (error) {
    console.error(
      `[pricing] Refresh failed source=${priceSource} ids=${metrics.totalIds} durationMs=${Date.now() - startedAt}:`,
      error
    );
    throw error;
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
