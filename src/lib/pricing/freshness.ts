import type { PriceData } from "@/lib/services/portfolio-calculator";
import { lookupPrice } from "@/lib/pricing/price-map";

export interface PriceFreshnessToken {
  coingeckoId: string | null | undefined;
  symbol?: string | null | undefined;
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
    const entry = lookupPrice(priceMap, token.symbol, token.coingeckoId);
    const updatedAt = entry?.updatedAt;
    if (typeof updatedAt === "string" && updatedAt.length > 0) {
      updatedAts.push(updatedAt);
    }
  }

  if (updatedAts.length === 0) return null;
  return updatedAts.reduce((newest, value) => (value > newest ? value : newest));
}
