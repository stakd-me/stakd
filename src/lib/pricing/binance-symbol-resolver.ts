const BINANCE_SYMBOL_PATTERN = /^[A-Z0-9]{2,20}$/;

/**
 * Curated CoinGecko -> CEX symbol map for high-usage assets.
 * This prevents wrong pricing when many CoinGecko tokens share the same symbol.
 */
const COINGECKO_TO_BINANCE_SYMBOL: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  tether: "USDT",
  "usd-coin": "USDC",
  binancecoin: "BNB",
  solana: "SOL",
  ripple: "XRP",
  cardano: "ADA",
  dogecoin: "DOGE",
  tron: "TRX",
  chainlink: "LINK",
  "avalanche-2": "AVAX",
  "shiba-inu": "SHIB",
  litecoin: "LTC",
  "bitcoin-cash": "BCH",
  polkadot: "DOT",
  uniswap: "UNI",
  near: "NEAR",
  aptos: "APT",
  "internet-computer": "ICP",
  filecoin: "FIL",
  aave: "AAVE",
  maker: "MKR",
  "injective-protocol": "INJ",
  "the-open-network": "TON",
  stellar: "XLM",
  cosmos: "ATOM",
  pepe: "PEPE",
  arbitrum: "ARB",
  optimism: "OP",
  sui: "SUI",
  "render-token": "RENDER",
  "immutable-x": "IMX",
  "sei-network": "SEI",
  ethena: "ENA",
  "worldcoin-wld": "WLD",
  "the-graph": "GRT",
  "curve-dao-token": "CRV",
  "theta-token": "THETA",
};

const BINANCE_SYMBOL_TO_COINGECKO_ID: Record<string, string> = Object.entries(
  COINGECKO_TO_BINANCE_SYMBOL
).reduce<Record<string, string>>((acc, [coingeckoId, symbol]) => {
  if (!acc[symbol]) {
    acc[symbol] = coingeckoId;
  }
  return acc;
}, {});

function normalizeCoinId(id: string): string {
  return id.trim().toLowerCase();
}

function normalizeSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const normalized = symbol.trim().toUpperCase();
  if (!BINANCE_SYMBOL_PATTERN.test(normalized)) return null;
  return normalized;
}

/**
 * Returns the safest CEX symbol candidate for a CoinGecko token.
 * Priority:
 * 1) Curated by CoinGecko ID (collision-safe for top assets)
 * 2) Sanitized fallback symbol (legacy behavior for long-tail assets)
 */
export function resolveBinanceSymbol(
  coingeckoId: string,
  fallbackSymbol?: string | null
): string | null {
  const id = normalizeCoinId(coingeckoId);
  if (!id) return null;

  const mapped = COINGECKO_TO_BINANCE_SYMBOL[id];
  if (mapped) return mapped;

  return normalizeSymbol(fallbackSymbol);
}

/**
 * Returns the canonical CoinGecko ID for a known ticker symbol (BTC, SOL, ...).
 * Used by search ranking to keep primary assets above bridged/pegged lookalikes.
 */
export function resolveCanonicalCoinGeckoIdBySymbol(
  symbol: string | null | undefined
): string | null {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;
  return BINANCE_SYMBOL_TO_COINGECKO_ID[normalized] ?? null;
}
