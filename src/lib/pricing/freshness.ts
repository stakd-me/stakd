import type { PriceData } from "@/lib/services/portfolio-calculator";
import { resolveBinanceSymbol } from "@/lib/pricing/binance-symbol-resolver";

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

function oldestIso(values: string[]): string | null {
  if (values.length === 0) return null;
  return values.reduce((oldest, value) => (value < oldest ? value : oldest));
}

/**
 * Returns the oldest updatedAt for tokens relevant to the current view.
 * Behavior:
 * - If at least one token is Binance-eligible, only Binance-eligible timestamps are considered.
 * - Otherwise, all provided tokens are considered (e.g. CoinGecko-only portfolio).
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

  const rows = Array.from(tokenMap.entries()).map(([coingeckoId, symbol]) => ({
    coingeckoId,
    symbol,
    updatedAt: priceMap[coingeckoId]?.updatedAt ?? null,
    // Use curated ID mapping only (no symbol fallback) to avoid
    // classifying CoinGecko-only long-tail tokens as Binance-backed.
    isBinanceEligible: !!resolveBinanceSymbol(coingeckoId),
  }));

  const binanceRows = rows.filter((row) => row.isBinanceEligible);
  const sourceRows = binanceRows.length > 0 ? binanceRows : rows;

  const updatedAts = sourceRows
    .map((row) => row.updatedAt)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  return oldestIso(updatedAts);
}
