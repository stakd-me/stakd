import type { VaultData } from "@/lib/crypto/vault-types";

// ── Types ───────────────────────────────────────────────────────────

export interface PriceData {
  usd: number;
  change24h: number | null;
  updatedAt?: string | null;
}

export interface TokenAllocation {
  symbol: string;
  valueUsd: number;
  percent: number;
  coingeckoId: string | null;
  isStaking: boolean;
  balance: number;
}

export interface PortfolioSummary {
  totalValueUsd: number;
  tokenAllocations: TokenAllocation[];
  symbolValues: Record<string, number>;
}

export interface TokenHolding {
  symbol: string;
  tokenName: string;
  coingeckoId: string | null;
  currentQty: number;
  buyQty: number;
  sellQty: number;
  totalBuyCost: number;
  totalSellRevenue: number;
  totalFees: number;
  avgCostBasis: number;
  currentPrice: number;
  change24h: number | null;
  currentValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
}

function toSafeNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeCoingeckoId(
  value: string | null | undefined
): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getPriceByCoingeckoId(
  priceMap: Record<string, PriceData>,
  coingeckoId: string | null | undefined
): PriceData | null {
  const normalized = normalizeCoingeckoId(coingeckoId);
  if (!normalized) return null;
  return priceMap[normalized] ?? null;
}

// ── Core: compute holdings from vault data + prices ──────────────────

export function getHoldings(
  vault: VaultData,
  priceMap: Record<string, PriceData>
): TokenHolding[] {
  const allTx = vault.transactions;

  // Group by (tokenSymbol upper + coingeckoId)
  const groups: Record<string, {
    symbol: string;
    tokenName: string;
    coingeckoId: string | null;
    buyQty: number;
    receiveQty: number;
    sellQty: number;
    sendQty: number;
    totalBuyCost: number;
    totalSellRevenue: number;
    totalFees: number;
  }> = {};

  for (const tx of allTx) {
    const normalizedCoingeckoId = normalizeCoingeckoId(tx.coingeckoId);
    const key = `${tx.tokenSymbol.toUpperCase()}:${normalizedCoingeckoId ?? ""}`;
    if (!groups[key]) {
      groups[key] = {
        symbol: tx.tokenSymbol,
        tokenName: tx.tokenName,
        coingeckoId: normalizedCoingeckoId,
        buyQty: 0,
        receiveQty: 0,
        sellQty: 0,
        sendQty: 0,
        totalBuyCost: 0,
        totalSellRevenue: 0,
        totalFees: 0,
      };
    }

    const qty = toSafeNumber(tx.quantity);
    const cost = toSafeNumber(tx.totalCost);
    const fee = toSafeNumber(tx.fee || "0");

    groups[key].totalFees += fee;

    if (tx.type === "buy") {
      groups[key].buyQty += qty;
      groups[key].totalBuyCost += cost + fee;
    } else if (tx.type === "receive") {
      groups[key].receiveQty += qty;
    } else if (tx.type === "sell") {
      groups[key].sellQty += qty;
      groups[key].totalSellRevenue += cost - fee;
    } else if (tx.type === "send") {
      groups[key].sendQty += qty;
    }
  }

  const holdings: TokenHolding[] = [];

  for (const g of Object.values(groups)) {
    const currentQty = g.buyQty + g.receiveQty - g.sellQty - g.sendQty;
    const avgCostBasis = g.buyQty > 0 ? g.totalBuyCost / g.buyQty : 0;
    const priceData = getPriceByCoingeckoId(priceMap, g.coingeckoId);
    const currentPrice = toSafeNumber(priceData?.usd);
    const change24h = priceData?.change24h ?? null;

    const currentValue = Math.max(currentQty, 0) * currentPrice;
    const unrealizedPL = Math.max(currentQty, 0) * (currentPrice - avgCostBasis);
    // "send" transfers reduce inventory but do not realize P/L.
    const costBasisForSold = g.sellQty * avgCostBasis;
    const realizedPL = g.totalSellRevenue - costBasisForSold;
    const unrealizedPLPercent = avgCostBasis > 0 && currentQty > 0
      ? ((currentPrice - avgCostBasis) / avgCostBasis) * 100
      : 0;

    holdings.push({
      symbol: g.symbol,
      tokenName: g.tokenName,
      coingeckoId: g.coingeckoId,
      currentQty: Math.max(currentQty, 0),
      buyQty: g.buyQty,
      sellQty: g.sellQty,
      totalBuyCost: g.totalBuyCost,
      totalSellRevenue: g.totalSellRevenue,
      totalFees: g.totalFees,
      avgCostBasis,
      currentPrice,
      change24h,
      currentValue,
      unrealizedPL,
      unrealizedPLPercent,
      realizedPL,
    });
  }

  // Merge manual entries
  for (const entry of vault.manualEntries) {
    const normalizedEntryId = normalizeCoingeckoId(entry.coingeckoId);
    const existing = holdings.find(
      (h) =>
        h.symbol.toUpperCase() === entry.tokenSymbol.toUpperCase() &&
        (h.coingeckoId ?? "") === (normalizedEntryId ?? "")
    );

    const priceData = getPriceByCoingeckoId(priceMap, normalizedEntryId);
    const currentPrice = toSafeNumber(priceData?.usd);
    const change24h = priceData?.change24h ?? null;
    const entryQty = toSafeNumber(entry.quantity);

    if (existing) {
      existing.currentQty += entryQty;
      existing.currentValue = existing.currentQty * existing.currentPrice;
      existing.unrealizedPL = existing.currentQty * (existing.currentPrice - existing.avgCostBasis);
      existing.unrealizedPLPercent = existing.avgCostBasis > 0 && existing.currentQty > 0
        ? ((existing.currentPrice - existing.avgCostBasis) / existing.avgCostBasis) * 100
        : 0;
    } else {
      const currentValue = entryQty * currentPrice;
      holdings.push({
        symbol: entry.tokenSymbol,
        tokenName: entry.tokenName,
        coingeckoId: normalizedEntryId,
        currentQty: entryQty,
        buyQty: 0,
        sellQty: 0,
        totalBuyCost: 0,
        totalSellRevenue: 0,
        totalFees: 0,
        avgCostBasis: 0,
        currentPrice,
        change24h,
        currentValue,
        unrealizedPL: 0,
        unrealizedPLPercent: 0,
        realizedPL: 0,
      });
    }
  }

  holdings.sort((a, b) => b.currentValue - a.currentValue);
  return holdings;
}

// ── Public API ───────────────────────────────────────────────────────

export function getPortfolioSummary(
  vault: VaultData,
  priceMap: Record<string, PriceData>
): PortfolioSummary {
  const holdings = getHoldings(vault, priceMap);

  let totalValue = 0;
  const symbolValues: Record<string, number> = {};

  for (const h of holdings) {
    totalValue += h.currentValue;
    const sym = h.symbol.toUpperCase();
    symbolValues[sym] = (symbolValues[sym] || 0) + h.currentValue;
  }

  const tokenAllocations: TokenAllocation[] = holdings
    .filter((h) => h.currentQty > 0)
    .map((h) => ({
      symbol: h.symbol,
      valueUsd: Math.round(h.currentValue * 100) / 100,
      percent: totalValue > 0 ? Math.round((h.currentValue / totalValue) * 10000) / 100 : 0,
      coingeckoId: h.coingeckoId,
      isStaking: false,
      balance: h.currentQty,
    }));

  return {
    totalValueUsd: Math.round(totalValue * 100) / 100,
    tokenAllocations,
    symbolValues,
  };
}

export function getSymbolValues(
  vault: VaultData,
  priceMap: Record<string, PriceData>
): { symbolValues: Record<string, number>; totalValue: number } {
  const summary = getPortfolioSummary(vault, priceMap);
  return { symbolValues: summary.symbolValues, totalValue: summary.totalValueUsd };
}

export function calculatePortfolioTotal(
  vault: VaultData,
  priceMap: Record<string, PriceData>
): number {
  return getPortfolioSummary(vault, priceMap).totalValueUsd;
}

export function getTokenAllocations(
  vault: VaultData,
  priceMap: Record<string, PriceData>
): TokenAllocation[] {
  return getPortfolioSummary(vault, priceMap).tokenAllocations;
}
