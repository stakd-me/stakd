import { resolveCanonicalCoinGeckoIdBySymbol } from "@/lib/pricing/binance-symbol-resolver";

export interface SearchableToken {
  id: string;
  symbol: string;
  name: string;
  binance: boolean;
}

const DERIVATIVE_OR_PEG_KEYWORDS = [
  "bridged",
  "bridge",
  "wrapped",
  "wormhole",
  "peg",
  "staked",
  "liquid staking",
  "restaked",
  "synthetic",
  "pool token",
  "lp token",
  "vault",
] as const;

function isLikelyDerivativeToken(token: SearchableToken): boolean {
  const id = token.id.toLowerCase();
  const name = token.name.toLowerCase();
  return DERIVATIVE_OR_PEG_KEYWORDS.some(
    (keyword) => id.includes(keyword) || name.includes(keyword)
  );
}

function scoreToken(
  token: SearchableToken,
  queryLower: string,
  canonicalCoinId: string | null
): number | null {
  const id = token.id.toLowerCase();
  const symbol = token.symbol.toLowerCase();
  const name = token.name.toLowerCase();

  const symbolExact = symbol === queryLower;
  const idExact = id === queryLower;
  const nameExact = name === queryLower;
  const symbolStartsWith = symbol.startsWith(queryLower);
  const idStartsWith = id.startsWith(queryLower);
  const nameStartsWith = name.startsWith(queryLower);
  const symbolIncludes = symbol.includes(queryLower);
  const idIncludes = id.includes(queryLower);
  const nameIncludes = name.includes(queryLower);

  if (!(symbolIncludes || idIncludes || nameIncludes)) {
    return null;
  }

  let score = 0;

  if (symbolExact) score += 1200;
  if (idExact) score += 1100;
  if (nameExact) score += 1000;
  if (symbolStartsWith) score += 900;
  if (idStartsWith) score += 700;
  if (nameStartsWith) score += 650;
  if (symbolIncludes) score += 300;
  if (idIncludes) score += 220;
  if (nameIncludes) score += 180;

  // Prefer assets with reliable price-route support.
  if (token.binance) score += 120;

  // Push obvious wrappers/pegs/derivatives below canonical results.
  if (isLikelyDerivativeToken(token)) score -= 450;

  // Keep canonical coin first when query is a common ticker (BTC, SOL, ...).
  if (canonicalCoinId && id === canonicalCoinId) score += 2000;
  if (canonicalCoinId && symbolExact && id !== canonicalCoinId) score -= 600;

  // Prefer shorter canonical-style IDs/names over verbose variants.
  score -= Math.min(120, id.length * 1.2);
  score -= Math.min(80, name.length * 0.8);

  return score;
}

export function rankTokenSearchResults(
  tokens: SearchableToken[],
  query: string,
  limit = 15
): SearchableToken[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || limit <= 0) return [];

  const canonicalCoinId = resolveCanonicalCoinGeckoIdBySymbol(
    normalizedQuery.toUpperCase()
  );

  const ranked = tokens
    .map((token) => ({
      token,
      score: scoreToken(token, normalizedQuery, canonicalCoinId),
    }))
    .filter((item): item is { token: SearchableToken; score: number } => {
      return item.score !== null;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.token.binance !== b.token.binance) return a.token.binance ? -1 : 1;
      if (a.token.id.length !== b.token.id.length) return a.token.id.length - b.token.id.length;
      return a.token.name.localeCompare(b.token.name);
    });

  return ranked.slice(0, limit).map((item) => item.token);
}
