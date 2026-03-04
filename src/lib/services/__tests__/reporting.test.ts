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

function makeBreakdown(
  items: Array<{ symbol: string; coingeckoId: string; valueUsd: number }>
): string {
  return JSON.stringify(
    items.map((item) => ({
      symbol: item.symbol,
      coingeckoId: item.coingeckoId,
      valueUsd: item.valueUsd,
      percent: 0,
    }))
  );
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

  it("uses previous to-date windows for comparisons", () => {
    const report = computePortfolioReport({
      vault: createEmptyVault(),
      holdings: [],
      currentTotalValueUsd: 0,
      period: "monthly",
      referenceDate: new Date("2026-03-20T12:00:00.000Z"),
    });

    expect(report.window.startIso).toBe("2026-03-01T00:00:00.000Z");
    expect(report.window.previousStartIso).toBe("2026-02-01T00:00:00.000Z");
    expect(report.window.previousEndIso).toBe("2026-02-20T12:00:00.000Z");
  });

  it("does not forward-fill start value from future snapshots", () => {
    const vault = createEmptyVault();
    vault.portfolioSnapshots = [
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

    expect(report.summary.startValueUsd).toBe(1090);
    expect(report.summary.endValueUsd).toBe(1200);
    expect(report.summary.pnlUsd).toBe(0);
  });

  it("computes concentration risk snapshot from current holdings", () => {
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
    expect(report.topHoldings).toHaveLength(2);
  });

  it("computes best/worst performer by period return (to-date)", () => {
    const vault = createEmptyVault();
    vault.portfolioSnapshots = [
      {
        id: "s1",
        totalValueUsd: 1000,
        breakdown: makeBreakdown([
          { symbol: "BTC", coingeckoId: "bitcoin", valueUsd: 600 },
          { symbol: "ETH", coingeckoId: "ethereum", valueUsd: 400 },
        ]),
        snapshotAt: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "s2",
        totalValueUsd: 1050,
        breakdown: makeBreakdown([
          { symbol: "BTC", coingeckoId: "bitcoin", valueUsd: 700 },
          { symbol: "ETH", coingeckoId: "ethereum", valueUsd: 350 },
        ]),
        snapshotAt: "2026-03-04T00:00:00.000Z",
      },
    ];
    vault.transactions = [
      {
        id: "seed-btc",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "",
        type: "buy",
        quantity: "0.6",
        pricePerUnit: "1000",
        totalCost: "600",
        fee: "0",
        coingeckoId: "bitcoin",
        note: null,
        transactedAt: "2026-02-20T00:00:00.000Z",
        createdAt: "2026-02-20T00:00:00.000Z",
      },
      {
        id: "seed-eth",
        tokenSymbol: "ETH",
        tokenName: "Ethereum",
        chain: "",
        type: "receive",
        quantity: "1",
        pricePerUnit: "400",
        totalCost: "400",
        fee: "0",
        coingeckoId: "ethereum",
        note: null,
        transactedAt: "2026-02-20T00:00:00.000Z",
        createdAt: "2026-02-20T00:00:00.000Z",
      },
      {
        id: "buy-btc",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "",
        type: "buy",
        quantity: "0.05",
        pricePerUnit: "1000",
        totalCost: "50",
        fee: "0",
        coingeckoId: "bitcoin",
        note: null,
        transactedAt: "2026-03-02T00:00:00.000Z",
        createdAt: "2026-03-02T00:00:00.000Z",
      },
      {
        id: "sell-eth",
        tokenSymbol: "ETH",
        tokenName: "Ethereum",
        chain: "",
        type: "sell",
        quantity: "0.05",
        pricePerUnit: "1000",
        totalCost: "50",
        fee: "0",
        coingeckoId: "ethereum",
        note: null,
        transactedAt: "2026-03-03T00:00:00.000Z",
        createdAt: "2026-03-03T00:00:00.000Z",
      },
    ];

    const holdings = [
      makeHolding({
        symbol: "BTC",
        tokenName: "Bitcoin",
        coingeckoId: "bitcoin",
        currentValue: 700,
      }),
      makeHolding({
        symbol: "ETH",
        tokenName: "Ethereum",
        coingeckoId: "ethereum",
        currentValue: 350,
      }),
    ];

    const report = computePortfolioReport({
      vault,
      holdings,
      currentTotalValueUsd: 1050,
      period: "monthly",
      referenceDate: new Date("2026-03-04T18:00:00.000Z"),
    });

    expect(report.bestPerformer?.symbol).toBe("BTC");
    expect(report.bestPerformer?.returnPercent).toBeCloseTo(7.69, 2);
    expect(report.bestPerformer?.pnlUsd).toBe(50);
    expect(report.bestPerformer?.heldDays).toBe(13);
    expect(report.bestPerformer?.pnlPerHeldDayUsd).toBeCloseTo(3.85, 2);
    expect(report.bestPerformer?.annualizedReturnPercent).toBeGreaterThan(0);
    expect(report.worstPerformer?.symbol).toBe("ETH");
    expect(report.worstPerformer?.returnPercent).toBeCloseTo(0, 2);
    expect(report.worstPerformer?.pnlUsd).toBe(0);
    expect(report.worstPerformer?.heldDays).toBe(13);
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
