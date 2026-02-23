import { describe, expect, it } from "vitest";
import { computePerformanceMetrics } from "@/lib/services/analytics";
import type { TokenHolding } from "@/lib/services/portfolio-calculator";

function createHolding(
  partial: Partial<TokenHolding> & Pick<TokenHolding, "symbol" | "tokenName">
): TokenHolding {
  return {
    symbol: partial.symbol,
    tokenName: partial.tokenName,
    coingeckoId: partial.coingeckoId ?? null,
    currentQty: partial.currentQty ?? 0,
    buyQty: partial.buyQty ?? 0,
    sellQty: partial.sellQty ?? 0,
    totalBuyCost: partial.totalBuyCost ?? 0,
    totalSellRevenue: partial.totalSellRevenue ?? 0,
    totalFees: partial.totalFees ?? 0,
    avgCostBasis: partial.avgCostBasis ?? 0,
    currentPrice: partial.currentPrice ?? 0,
    change24h: partial.change24h ?? null,
    currentValue: partial.currentValue ?? 0,
    unrealizedPL: partial.unrealizedPL ?? 0,
    unrealizedPLPercent: partial.unrealizedPLPercent ?? 0,
    realizedPL: partial.realizedPL ?? 0,
  };
}

describe("analytics service", () => {
  it("includes realized returns from closed positions", () => {
    const metrics = computePerformanceMetrics([
      createHolding({
        symbol: "BTC",
        tokenName: "Bitcoin",
        currentQty: 1,
        buyQty: 1,
        sellQty: 0,
        totalBuyCost: 100,
        totalSellRevenue: 0,
        currentPrice: 120,
        currentValue: 120,
        unrealizedPL: 20,
        unrealizedPLPercent: 20,
        realizedPL: 0,
      }),
      createHolding({
        symbol: "ETH",
        tokenName: "Ethereum",
        currentQty: 0,
        buyQty: 2,
        sellQty: 2,
        totalBuyCost: 200,
        totalSellRevenue: 250,
        currentPrice: 0,
        currentValue: 0,
        unrealizedPL: 0,
        unrealizedPLPercent: 0,
        realizedPL: 50,
      }),
    ]);

    expect(metrics.totalInvested).toBe(300);
    expect(metrics.totalValue).toBe(120);
    expect(metrics.totalReturn).toBe(70);
    expect(metrics.totalReturnPercent).toBeCloseTo(23.33, 2);
    expect(metrics.winRate).toBe(100);
    expect(metrics.bestPerformer?.symbol).toBe("ETH");
    expect(metrics.bestPerformer?.returnPercent).toBe(25);
    expect(metrics.worstPerformer?.symbol).toBe("BTC");
    expect(metrics.worstPerformer?.returnPercent).toBe(20);
    expect(metrics.numberOfTokens).toBe(1);
    expect(metrics.avgHoldingValue).toBe(120);
  });

  it("handles holdings without cost basis safely", () => {
    const metrics = computePerformanceMetrics([
      createHolding({
        symbol: "AIRDROP",
        tokenName: "Airdrop Token",
        currentQty: 10,
        buyQty: 0,
        sellQty: 0,
        totalBuyCost: 0,
        totalSellRevenue: 0,
        currentPrice: 5,
        currentValue: 50,
        unrealizedPL: 0,
        unrealizedPLPercent: 0,
        realizedPL: 0,
      }),
    ]);

    expect(metrics.totalInvested).toBe(0);
    expect(metrics.totalValue).toBe(50);
    expect(metrics.totalReturn).toBe(0);
    expect(metrics.totalReturnPercent).toBe(0);
    expect(metrics.winRate).toBe(0);
    expect(metrics.bestPerformer).toBeNull();
    expect(metrics.worstPerformer).toBeNull();
    expect(metrics.numberOfTokens).toBe(1);
    expect(metrics.avgHoldingValue).toBe(50);
  });
});
