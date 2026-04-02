import type { PriceData } from "@/lib/services/portfolio-calculator";
import { COINGECKO_TO_BINANCE_SYMBOL } from "@/lib/pricing/binance-symbol-resolver";

export interface PriceFreshnessToken {
  coingeckoId: string | null | undefined;
  symbol?: string | null | undefined;
}

function normalizeCoingeckoId(
  value: string | null | undefined
): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function newestIso(values: string[]): string | null {
  if (values.length === 0) return null;
  return values.reduce((newest, value) => (value > newest ? value : newest));
}

/**
 * Returns the newest updatedAt across tokens with real-time price feeds.
 * Behavior:
 * - If at least one token is streamed via Binance WS, return the newest
 *   timestamp from those tokens (real-time tokens represent current freshness).
 * - Otherwise, fall back to the newest timestamp across all tokens.
 */
export function getOldestPriceUpdateForTokens(
  priceMap: Record<string, PriceData>,
  tokens: PriceFreshnessToken[]
): string | null {
  const tokenMap = new Map<string, string | null>();

  for (const token of tokens) {
    const id = normalizeCoingeckoId(token.coingeckoId);
    if (!id) continue;
    const symbol = token.symbol?.trim().toUpperCase() ?? null;
    const existing = tokenMap.get(id);
    if (!existing && symbol) {
      tokenMap.set(id, symbol);
      continue;
    }
    if (!tokenMap.has(id)) {
      tokenMap.set(id, symbol);
    }
  }

  const rows = Array.from(tokenMap.entries()).map(([coingeckoId]) => ({
    coingeckoId,
    updatedAt: priceMap[coingeckoId]?.updatedAt ?? null,
    isRealTime: !!COINGECKO_TO_BINANCE_SYMBOL[coingeckoId],
  }));

  const realTimeRows = rows.filter((row) => row.isRealTime);
  const sourceRows = realTimeRows.length > 0 ? realTimeRows : rows;

  const updatedAts = sourceRows
    .map((row) => row.updatedAt)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  return newestIso(updatedAts);
}
