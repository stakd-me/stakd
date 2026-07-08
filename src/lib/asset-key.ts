/**
 * Canonical asset identity helpers. Every module that keys holdings, prices,
 * or snapshots by symbol/coingeckoId must use these so keys match across
 * modules. (Exchange-specific symbol *validators* with pattern checks live
 * with their exchange clients and are intentionally separate.)
 */

export function normalizeCoingeckoId(
  value: string | null | undefined
): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeSymbol(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/** Composite `SYMBOL:coingeckoId` key; empty string when there is no symbol. */
export function makeAssetKey(symbol: unknown, coingeckoId: unknown): string {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) return "";
  const normalizedId =
    typeof coingeckoId === "string" ? normalizeCoingeckoId(coingeckoId) : null;
  return `${normalizedSymbol}:${normalizedId ?? ""}`;
}
