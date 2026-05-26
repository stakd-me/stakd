import type { VaultData } from "@/lib/crypto/vault-types";
import { expandTransactionForBalance } from "@/lib/transactions";
import { BINANCE_SYMBOL_TO_COINGECKO_ID } from "@/lib/pricing/binance-symbol-resolver";
import { buildStablecoinSymbolSet } from "@/lib/constants/stablecoins";

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
  avgCostOverrideUsd: number | null;
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

/**
 * Auto-resolve coingeckoId from symbol when missing.
 * Uses the curated BINANCE_SYMBOL_TO_COINGECKO_ID map for top assets.
 */
function resolveCoingeckoId(
  coingeckoId: string | null | undefined,
  symbol: string
): string | null {
  const normalized = normalizeCoingeckoId(coingeckoId);
  if (normalized) return normalized;
  return BINANCE_SYMBOL_TO_COINGECKO_ID[symbol.trim().toUpperCase()] ?? null;
}

function getHoldingKey(
  symbol: string,
  coingeckoId: string | null | undefined
): string {
  return `${symbol.trim().toUpperCase()}:${normalizeCoingeckoId(coingeckoId) ?? ""}`;
}

function buildCostBasisOverrideMap(vault: VaultData): Map<string, number> {
  const overrides = new Map<string, number>();

  for (const override of vault.costBasisOverrides ?? []) {
    if (
      !override.tokenSymbol ||
      !Number.isFinite(override.avgCostUsd) ||
      override.avgCostUsd < 0
    ) {
      continue;
    }

    overrides.set(
      getHoldingKey(override.tokenSymbol, override.coingeckoId),
      override.avgCostUsd
    );
  }

  return overrides;
}

function getCostBasisOverride(
  overrides: Map<string, number>,
  symbol: string,
  coingeckoId: string | null | undefined
): number | null {
  const exact = overrides.get(getHoldingKey(symbol, coingeckoId));
  return exact ?? null;
}

/**
 * Look up price by symbol first (CEX/Binance), then coingeckoId (CoinGecko fallback).
 * priceMap is dual-keyed: both "BTC" and "bitcoin" point to the same price data.
 */
function getPrice(
  priceMap: Record<string, PriceData>,
  symbol: string | undefined,
  coingeckoId: string | null | undefined
): PriceData | null {
  // Primary: look up by symbol (CEX price, always available)
  if (symbol) {
    const upper = symbol.trim().toUpperCase();
    if (upper && priceMap[upper]) return priceMap[upper];
  }
  // Fallback: look up by coingeckoId (CoinGecko / long-tail tokens)
  const normalized = normalizeCoingeckoId(coingeckoId);
  if (normalized && priceMap[normalized]) return priceMap[normalized];
  return null;
}

// ── Core: compute holdings from vault data + prices ──────────────────

export function getHoldings(
  vault: VaultData,
  priceMap: Record<string, PriceData>
): TokenHolding[] {
  const allTx = vault.transactions.flatMap(expandTransactionForBalance);
  const stablecoinSymbols = buildStablecoinSymbolSet(vault.tokenCategories);
  const costBasisOverrides = buildCostBasisOverrideMap(vault);

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
    receiveCostBasis: number;
    receiveQtyWithBasis: number;
  }> = {};

  for (const tx of allTx) {
    const normalizedCoingeckoId = resolveCoingeckoId(tx.coingeckoId, tx.tokenSymbol);
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
        receiveCostBasis: 0,
        receiveQtyWithBasis: 0,
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
      if (
        typeof tx.costBasisUsd === "number" &&
        Number.isFinite(tx.costBasisUsd) &&
        tx.costBasisUsd >= 0
      ) {
        groups[key].receiveCostBasis += tx.costBasisUsd;
        groups[key].receiveQtyWithBasis += qty;
      }
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
    const isStablecoin = stablecoinSymbols.has(g.symbol.toUpperCase());

    // Include explicit receive cost basis when available (weighted by qty that brought cost)
    const totalCostForBasis = g.totalBuyCost + g.receiveCostBasis;
    const qtyWithBasis = g.buyQty + g.receiveQtyWithBasis;
    const calculatedAvgCostBasis = isStablecoin ? 1 : (qtyWithBasis > 0 ? totalCostForBasis / qtyWithBasis : 0);
    const avgCostOverrideUsd = getCostBasisOverride(
      costBasisOverrides,
      g.symbol,
      g.coingeckoId
    );
    const avgCostBasis = avgCostOverrideUsd ?? calculatedAvgCostBasis;
    const priceData = getPrice(priceMap, g.symbol, g.coingeckoId);
    const currentPrice = toSafeNumber(priceData?.usd);
    const change24h = priceData?.change24h ?? null;

    const currentValue = Math.max(currentQty, 0) * currentPrice;
    // Stablecoins are the unit of account — P&L is not meaningful.
    const unrealizedPL = isStablecoin ? 0 : Math.max(currentQty, 0) * (currentPrice - avgCostBasis);
    // "send" transfers reduce inventory but do not realize P/L.
    const costBasisForSold = g.sellQty * avgCostBasis;
    const realizedPL = isStablecoin ? 0 : g.totalSellRevenue - costBasisForSold;
    const unrealizedPLPercent = isStablecoin ? 0 : (avgCostBasis > 0 && currentQty > 0
      ? ((currentPrice - avgCostBasis) / avgCostBasis) * 100
      : 0);

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
      avgCostOverrideUsd,
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
    const normalizedEntryId = resolveCoingeckoId(entry.coingeckoId, entry.tokenSymbol);
    const existing = holdings.find(
      (h) =>
        h.symbol.toUpperCase() === entry.tokenSymbol.toUpperCase() &&
        (h.coingeckoId ?? "") === (normalizedEntryId ?? "")
    );

    const priceData = getPrice(priceMap, entry.tokenSymbol, normalizedEntryId);
    const currentPrice = toSafeNumber(priceData?.usd);
    const change24h = priceData?.change24h ?? null;
    const entryQty = toSafeNumber(entry.quantity);
    const entryAvgCostOverrideUsd = getCostBasisOverride(
      costBasisOverrides,
      entry.tokenSymbol,
      normalizedEntryId
    );

    if (existing) {
      const isStablecoin = stablecoinSymbols.has(existing.symbol.toUpperCase());
      const existingQty = existing.currentQty;
      const existingCostBasis = existing.avgCostBasis * existingQty;

      // If the incoming manual entry brings its own explicit cost basis, do a proper weighted average
      let newAvgCostBasis: number;

      if (entry.costBasisUsd != null && entryQty > 0) {
        const incomingCostBasis = entry.costBasisUsd;
        const totalCostBasis = existingCostBasis + incomingCostBasis;
        const totalQty = existingQty + entryQty;
        newAvgCostBasis = totalQty > 0 ? totalCostBasis / totalQty : 0;
      } else {
        // No explicit basis on the manual entry → keep the existing blended avg cost
        newAvgCostBasis = existing.avgCostBasis;
      }

      existing.currentQty += entryQty;
      existing.avgCostBasis = entryAvgCostOverrideUsd ?? newAvgCostBasis;
      existing.avgCostOverrideUsd = entryAvgCostOverrideUsd;
      existing.currentValue = existing.currentQty * existing.currentPrice;
      existing.unrealizedPL = isStablecoin
        ? 0
        : existing.currentQty * (existing.currentPrice - existing.avgCostBasis);
      existing.realizedPL = isStablecoin ? 0 : existing.totalSellRevenue - existing.sellQty * existing.avgCostBasis;
      existing.unrealizedPLPercent = !isStablecoin && existing.avgCostBasis > 0 && existing.currentQty > 0
        ? ((existing.currentPrice - existing.avgCostBasis) / existing.avgCostBasis) * 100
        : 0;
    } else {
      const isStablecoin = stablecoinSymbols.has(entry.tokenSymbol.toUpperCase());
      const currentValue = entryQty * currentPrice;

      // New: respect explicit cost basis on manual entry if provided
      const calculatedManualAvgCost = entry.costBasisUsd != null && entryQty > 0
        ? entry.costBasisUsd / entryQty
        : 0;
      const manualAvgCost = entryAvgCostOverrideUsd ?? calculatedManualAvgCost;

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
        avgCostBasis: manualAvgCost,
        avgCostOverrideUsd: entryAvgCostOverrideUsd,
        currentPrice,
        change24h,
        currentValue,
        unrealizedPL: isStablecoin ? 0 : entryQty * (currentPrice - manualAvgCost),
        unrealizedPLPercent: !isStablecoin && manualAvgCost > 0
          ? ((currentPrice - manualAvgCost) / manualAvgCost) * 100
          : 0,
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
