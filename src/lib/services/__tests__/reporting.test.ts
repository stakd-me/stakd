import { createEmptyVault } from "@/lib/crypto/vault-types";
import type { TokenHolding } from "@/lib/services/portfolio-calculator";
import { computePortfolioReport } from "@/lib/services/reporting";

function makeHolding(overrides: Partial<TokenHolding>): TokenHolding {
  return {
    symbol: "BTC",
    tokenName: "Bitcoin",
    coingeckoId: "bitcoin",
    currentQty: 1,
    buyQty: 1,
    sellQty: 0,
    totalBuyCost: 1000,
    totalSellRevenue: 0,
    totalFees: 0,
    avgCostBasis: 1000,
    currentPrice: 1200,
    change24h: 3,
    currentValue: 1200,
    unrealizedPL: 200,
    unrealizedPLPercent: 20,
    realizedPL: 0,
    ...overrides,
  };
}

describe("computePortfolioReport", () => {
  it("computes weekly report metrics and activity", () => {
    const vault = createEmptyVault();
    vault.portfolioSnapshots = [
      {
        id: "s1",
        totalValueUsd: 1000,
        breakdown: "[]",
        snapshotAt: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "s2",
        totalValueUsd: 1100,
        breakdown: "[]",
        snapshotAt: "2026-03-03T00:00:00.000Z",
      },
      {
        id: "s3",
        totalValueUsd: 1200,
        breakdown: "[]",
        snapshotAt: "2026-03-04T00:00:00.000Z",
      },
    ];
    vault.transactions = [
      {
        id: "t1",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "",
        type: "buy",
        quantity: "0.1",
        pricePerUnit: "1000",
        totalCost: "100",
        fee: "10",
        coingeckoId: "bitcoin",
        note: null,
        transactedAt: "2026-03-03T12:00:00.000Z",
        createdAt: "2026-03-03T12:00:00.000Z",
      },
    ];

    const report = computePortfolioReport({
      vault,
      holdings: [makeHolding({})],
      currentTotalValueUsd: 1200,
      period: "weekly",
      referenceDate: new Date("2026-03-04T18:00:00.000Z"),
    });

    expect(report.window.startIso).toBe("2026-03-02T00:00:00.000Z");
    expect(report.window.label).toBe("W10 2026");
    expect(report.summary.startValueUsd).toBe(1000);
    expect(report.summary.endValueUsd).toBe(1200);
    expect(report.summary.netFlowUsd).toBe(110);
    expect(report.summary.pnlUsd).toBe(90);
    expect(report.activity.transactionCount).toBe(1);
    expect(report.activity.buyVolumeUsd).toBe(100);
    expect(report.activity.totalFeesUsd).toBe(10);
  });

  it("computes concentration risk and leaders from holdings", () => {
    const vault = createEmptyVault();
    const holdings = [
      makeHolding({
        symbol: "BTC",
        currentValue: 700,
        unrealizedPL: 120,
        unrealizedPLPercent: 20,
      }),
      makeHolding({
        symbol: "ETH",
        tokenName: "Ethereum",
        coingeckoId: "ethereum",
        currentValue: 300,
        unrealizedPL: -30,
        unrealizedPLPercent: -10,
      }),
    ];

    const report = computePortfolioReport({
      vault,
      holdings,
      currentTotalValueUsd: 1000,
      period: "monthly",
      referenceDate: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(report.risk.activeAssets).toBe(2);
    expect(report.risk.topConcentrationSymbol).toBe("BTC");
    expect(report.risk.topConcentrationPercent).toBe(70);
    expect(report.bestPerformer?.symbol).toBe("BTC");
    expect(report.worstPerformer?.symbol).toBe("ETH");
    expect(report.topHoldings).toHaveLength(2);
  });

  it("handles empty data without crashes", () => {
    const report = computePortfolioReport({
      vault: createEmptyVault(),
      holdings: [],
      currentTotalValueUsd: 0,
      period: "yearly",
      referenceDate: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(report.summary.startValueUsd).toBe(0);
    expect(report.summary.endValueUsd).toBe(0);
    expect(report.summary.pnlUsd).toBe(0);
    expect(report.activity.transactionCount).toBe(0);
    expect(report.risk.activeAssets).toBe(0);
    expect(report.timeline.length).toBeGreaterThanOrEqual(1);
  });
});
