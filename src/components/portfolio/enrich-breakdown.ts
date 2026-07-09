import type { BreakdownItem } from "@/components/portfolio/types";

interface RawBreakdownItem {
  holdingKey: string;
  symbol: string;
  tokenName: string;
  coingeckoId: string | null;
  value: number;
  percent: number;
  color: string;
  quantity: number;
  avgCost: number;
  avgCostOverride: number | null;
  currentPrice: number;
  change24h: number | null;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
}

interface HoldingLike {
  symbol: string;
  tokenName: string;
  coingeckoId: string | null;
  totalFees: number;
}

interface TransactionLike {
  type: string;
  tokenSymbol: string;
  coingeckoId: string | null;
  transactedAt: string;
}

/**
 * Enrich the portfolio-calculator breakdown with tokenName fallback,
 * totalFees (from holdings) and firstBuyDate (earliest buy/receive tx).
 * Pure function extracted verbatim from the portfolio page's useMemo.
 */
export function enrichBreakdown(
  rawBreakdown: RawBreakdownItem[],
  holdings: HoldingLike[],
  vaultTransactions: TransactionLike[]
): BreakdownItem[] {
  const holdingsByKey = new Map<string, HoldingLike>();
  for (const holding of holdings) {
    holdingsByKey.set(
      `${holding.symbol.toUpperCase()}:${holding.coingeckoId ?? ""}`,
      holding
    );
  }

  const firstBuyDateByKey = new Map<string, string>();
  for (const tx of vaultTransactions) {
    if (tx.type !== "buy" && tx.type !== "receive") {
      continue;
    }
    const key = `${tx.tokenSymbol.toUpperCase()}:${tx.coingeckoId ?? ""}`;
    const prev = firstBuyDateByKey.get(key);
    if (!prev || tx.transactedAt < prev) {
      firstBuyDateByKey.set(key, tx.transactedAt);
    }
  }

  return rawBreakdown.map((b) => {
    const key = `${b.symbol.toUpperCase()}:${b.coingeckoId ?? ""}`;
    const holding = holdingsByKey.get(key);
    return {
      holdingKey: b.holdingKey,
      symbol: b.symbol,
      tokenName: b.tokenName || holding?.tokenName || b.symbol,
      coingeckoId: b.coingeckoId,
      value: b.value,
      percent: b.percent,
      color: b.color,
      quantity: b.quantity,
      avgCost: b.avgCost,
      avgCostOverride: b.avgCostOverride,
      currentPrice: b.currentPrice,
      change24h: b.change24h,
      unrealizedPL: b.unrealizedPL,
      unrealizedPLPercent: b.unrealizedPLPercent,
      realizedPL: b.realizedPL,
      totalFees: holding?.totalFees ?? 0,
      firstBuyDate: firstBuyDateByKey.get(key) ?? null,
    };
  });
}
