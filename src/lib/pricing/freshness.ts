import type { PriceData } from "@/lib/services/portfolio-calculator";

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

/**
 * Returns the newest updatedAt across all portfolio tokens.
 * With real-time WebSocket prices, any actively-streamed token will have
 * a recent timestamp, so the newest value represents overall freshness.
 */
export function getOldestPriceUpdateForTokens(
  priceMap: Record<string, PriceData>,
  tokens: PriceFreshnessToken[]
): string | null {
  const updatedAts: string[] = [];

  for (const token of tokens) {
    // Try symbol first (CEX), then coingeckoId (CoinGecko fallback)
    const sym = (token.symbol ?? "").trim().toUpperCase();
    const id = normalizeCoingeckoId(token.coingeckoId);
    const entry = (sym ? priceMap[sym] : undefined) ?? (id ? priceMap[id] : undefined);
    const updatedAt = entry?.updatedAt;
    if (typeof updatedAt === "string" && updatedAt.length > 0) {
      updatedAts.push(updatedAt);
    }
  }

  if (updatedAts.length === 0) return null;
  return updatedAts.reduce((newest, value) => (value > newest ? value : newest));
}
