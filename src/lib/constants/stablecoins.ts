import type { VaultTokenCategory } from "@/lib/crypto/vault-types";

export const COMMON_STABLECOIN_SYMBOLS = [
  "USDT",
  "USDC",
  "DAI",
  "FDUSD",
  "TUSD",
  "USDE",
  "USDD",
  "USDP",
  "BUSD",
  "PYUSD",
  "FRAX",
  "GUSD",
  "LUSD",
] as const;

const COMMON_STABLECOIN_SYMBOL_SET = new Set<string>(
  COMMON_STABLECOIN_SYMBOLS
);

export function normalizeTokenSymbol(symbol: string | null | undefined): string {
  return (symbol ?? "").trim().toUpperCase();
}

export function isKnownStablecoinSymbol(
  symbol: string | null | undefined
): boolean {
  const normalized = normalizeTokenSymbol(symbol);
  return normalized.length > 0 && COMMON_STABLECOIN_SYMBOL_SET.has(normalized);
}

export function buildStablecoinSymbolSet(
  tokenCategories: { tokenSymbol: string; category: string }[]
): Set<string> {
  const stablecoinSymbols = new Set<string>(COMMON_STABLECOIN_SYMBOLS);

  for (const category of tokenCategories) {
    if (category.category.trim().toLowerCase() !== "stablecoin") {
      continue;
    }
    const normalizedSymbol = normalizeTokenSymbol(category.tokenSymbol);
    if (normalizedSymbol) {
      stablecoinSymbols.add(normalizedSymbol);
    }
  }

  return stablecoinSymbols;
}

export function withAutoStablecoinCategory(
  tokenCategories: VaultTokenCategory[],
  tokenSymbol: string | null | undefined,
  nowIso: string = new Date().toISOString()
): VaultTokenCategory[] {
  const normalizedSymbol = normalizeTokenSymbol(tokenSymbol);
  if (!isKnownStablecoinSymbol(normalizedSymbol)) {
    return tokenCategories;
  }

  const alreadyCategorized = tokenCategories.some(
    (category) => normalizeTokenSymbol(category.tokenSymbol) === normalizedSymbol
  );
  if (alreadyCategorized) {
    return tokenCategories;
  }

  return [
    ...tokenCategories,
    {
      id: crypto.randomUUID(),
      tokenSymbol: normalizedSymbol,
      category: "stablecoin",
      updatedAt: nowIso,
    },
  ];
}
