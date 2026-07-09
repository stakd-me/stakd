import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/lib/crypto/vault-types";
import type { PriceData } from "@/lib/services/portfolio-calculator";
import { buildStrategyContext } from "@/lib/services/rebalance-strategies";
import {
  computeExecutionSteps,
  computeSummary,
  computeAlerts,
  computeAutocompleteSuggestions,
  computeCategoryBreakdown,
} from "@/lib/services/rebalance-view";
import type { Suggestion, TokenGroup } from "@/components/rebalance/types";

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    tokenSymbol: "BTC",
    coingeckoId: null,
    targetPercent: 0,
    currentPercent: 0,
    currentValue: 0,
    targetValue: 0,
    deviation: 0,
    action: "hold",
    amount: 0,
    estimatedSlippage: 0,
    estimatedFee: 0,
    netAmount: 0,
    isUntargeted: false,
    isDust: false,
    ...overrides,
  };
}

function createSamplePriceMap(): Record<string, PriceData> {
  return {
    bitcoin: { usd: 100, change24h: null },
    ethereum: { usd: 100, change24h: null },
  };
}

function createAlertsVault() {
  const vault = createEmptyVault();
  vault.transactions = [
    {
      id: "tx-btc",
      tokenSymbol: "BTC",
      tokenName: "Bitcoin",
      chain: "bitcoin",
      type: "buy",
      quantity: "1",
      pricePerUnit: "100",
      totalCost: "100",
      fee: "0",
      coingeckoId: "bitcoin",
      note: null,
      transactedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "tx-eth",
      tokenSymbol: "ETH",
      tokenName: "Ethereum",
      chain: "ethereum",
      type: "buy",
      quantity: "1",
      pricePerUnit: "100",
      totalCost: "100",
      fee: "0",
      coingeckoId: "ethereum",
      note: null,
      transactedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  vault.rebalanceTargets = [
    {
      id: "target-btc",
      tokenSymbol: "BTC",
      targetPercent: 80,
      coingeckoId: "bitcoin",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  return vault;
}

describe("computeExecutionSteps", () => {
  it("returns an empty list when every suggestion is a hold", () => {
    const steps = computeExecutionSteps([
      makeSuggestion({ tokenSymbol: "BTC", action: "hold" }),
      makeSuggestion({ tokenSymbol: "ETH", action: "hold" }),
    ]);

    expect(steps).toEqual([]);
  });

  it("orders sells before buys and tracks running cash net of costs", () => {
    const steps = computeExecutionSteps([
      makeSuggestion({
        tokenSymbol: "BTC",
        action: "buy",
        amount: 50,
        estimatedSlippage: 0.5,
        estimatedFee: 0.1,
      }),
      makeSuggestion({
        tokenSymbol: "ETH",
        action: "sell",
        amount: 100,
        estimatedSlippage: 1,
        estimatedFee: 0.5,
      }),
      makeSuggestion({ tokenSymbol: "SOL", action: "hold" }),
    ]);

    expect(steps).toHaveLength(2);
    expect(steps?.[0]).toEqual({
      step: 1,
      tokenSymbol: "ETH",
      action: "sell",
      amount: 100,
      estimatedSlippage: 1,
      estimatedFee: 0.5,
      runningCashAfter: 98.5,
    });
    expect(steps?.[1]).toEqual({
      step: 2,
      tokenSymbol: "BTC",
      action: "buy",
      amount: 50,
      estimatedSlippage: 0.5,
      estimatedFee: 0.1,
      runningCashAfter: 47.9,
    });
  });
});

describe("computeSummary", () => {
  it("aggregates trade counts, volume, fees, and drift while ignoring untargeted rows", () => {
    const summary = computeSummary(
      [
        makeSuggestion({
          tokenSymbol: "AAA",
          action: "sell",
          amount: 100,
          deviation: -10,
          estimatedFee: 1,
          estimatedSlippage: 2,
        }),
        makeSuggestion({
          tokenSymbol: "BBB",
          action: "buy",
          amount: 50,
          deviation: 8,
          estimatedFee: 0.5,
          estimatedSlippage: 0.5,
        }),
        makeSuggestion({ tokenSymbol: "CCC", action: "hold", deviation: 2 }),
        makeSuggestion({
          tokenSymbol: "DDD",
          action: "hold",
          deviation: 100,
          isUntargeted: true,
        }),
      ],
      5
    );

    expect(summary).toEqual({
      tradeCount: 2,
      sellCount: 1,
      buyCount: 1,
      totalVolume: 150,
      totalEstimatedFees: 4,
      portfolioDrift: 20,
      portfolioEfficiency: 90,
      maxPostRebalanceDeviation: 2,
      isWellBalanced: false,
      driftThresholdPercent: 5,
    });
  });

  it("reports a well-balanced portfolio with zero efficiency gain when nothing is traded", () => {
    const summary = computeSummary(
      [makeSuggestion({ tokenSymbol: "BTC", action: "hold", deviation: 3 })],
      5
    );

    expect(summary?.tradeCount).toBe(0);
    expect(summary?.isWellBalanced).toBe(true);
    expect(summary?.portfolioDrift).toBe(3);
    // No trades: post-rebalance deviation equals current max deviation.
    expect(summary?.maxPostRebalanceDeviation).toBe(3);
    expect(summary?.portfolioEfficiency).toBe(0);
  });

  it("returns 100% efficiency when there is no drift at all", () => {
    const summary = computeSummary(
      [makeSuggestion({ tokenSymbol: "BTC", action: "hold", deviation: 0 })],
      5
    );

    expect(summary?.portfolioEfficiency).toBe(100);
    expect(summary?.isWellBalanced).toBe(true);
  });
});

describe("computeAlerts", () => {
  const noStablecoins = new Set<string>();

  it("returns no alerts for an empty portfolio", () => {
    const alerts = computeAlerts(
      [{ tokenSymbol: "BTC", targetPercent: 50 }],
      {},
      null,
      0,
      5,
      30,
      noStablecoins,
      false
    );

    expect(alerts).toEqual([]);
  });

  it("grades deviation severity against multiples of the hold zone", () => {
    const run = (currentValue: number) =>
      computeAlerts(
        [{ tokenSymbol: "AAA", targetPercent: 50 }],
        { AAA: currentValue },
        null,
        100,
        5,
        90,
        noStablecoins,
        false
      );

    // 56% vs 50% target → 6% deviation (just past the 5% hold zone).
    expect(run(56)).toEqual([
      {
        tokenSymbol: "AAA",
        targetPercent: 50,
        currentPercent: 56,
        deviation: 6,
        severity: "low",
        type: "deviation",
      },
    ]);
    // 11% deviation → beyond 2x hold zone.
    expect(run(61)[0].severity).toBe("medium");
    // 16% deviation → beyond 3x hold zone.
    expect(run(66)[0].severity).toBe("high");
    // Inside the hold zone → no alert.
    expect(run(54)).toEqual([]);
  });

  it("flags concentration for targeted and untargeted tokens above the threshold", () => {
    const alerts = computeAlerts(
      [{ tokenSymbol: "BTC", targetPercent: 55 }],
      { BTC: 55, DOGE: 40, ETH: 5 },
      null,
      100,
      5,
      30,
      noStablecoins,
      false
    );

    const concentration = alerts.filter((a) => a.type === "concentration_token");
    expect(concentration).toHaveLength(2);

    const btc = concentration.find((a) => a.tokenSymbol === "BTC");
    // 55% is above the 50% "high" threshold (30% + 20%).
    expect(btc?.severity).toBe("high");
    expect(btc?.targetPercent).toBe(55);

    const doge = concentration.find((a) => a.tokenSymbol === "DOGE");
    expect(doge?.severity).toBe("medium");
    expect(doge?.targetPercent).toBe(0);
    expect(doge?.deviation).toBe(40);
  });

  it("merges duplicate targets before computing deviations", () => {
    const alerts = computeAlerts(
      [
        { tokenSymbol: "btc", targetPercent: 30 },
        { tokenSymbol: "BTC", targetPercent: 30 },
      ],
      { BTC: 70 },
      null,
      100,
      5,
      90,
      noStablecoins,
      false
    );

    const deviations = alerts.filter((a) => a.type === "deviation");
    expect(deviations).toHaveLength(1);
    expect(deviations[0].targetPercent).toBe(60);
    expect(deviations[0].deviation).toBe(10);
    expect(deviations[0].severity).toBe("low");
  });

  it("skips stablecoin concentration when the exclusion setting is on", () => {
    const stablecoins = new Set(["USDT"]);
    const base = [
      { tokenSymbol: "USDT", targetPercent: 80 },
    ];
    const values = { USDT: 80, BTC: 20 };

    const excluded = computeAlerts(base, values, null, 100, 5, 30, stablecoins, true);
    expect(excluded.filter((a) => a.type === "concentration_token")).toEqual([]);

    const included = computeAlerts(base, values, null, 100, 5, 30, stablecoins, false);
    expect(
      included.filter((a) => a.type === "concentration_token").map((a) => a.tokenSymbol)
    ).toEqual(["USDT"]);
  });

  it("resolves current values through the strategy context built from a vault", () => {
    const vault = createAlertsVault();
    const context = buildStrategyContext(vault, createSamplePriceMap());

    const alerts = computeAlerts(
      vault.rebalanceTargets.map((t) => ({
        tokenSymbol: t.tokenSymbol,
        targetPercent: t.targetPercent,
      })),
      context.symbolValues,
      context,
      context.effectiveTotal,
      5,
      30,
      noStablecoins,
      false
    );

    // BTC holds $100 of a $200 portfolio → 50% vs an 80% target.
    const deviation = alerts.find((a) => a.type === "deviation");
    expect(deviation?.tokenSymbol).toBe("BTC");
    expect(deviation?.currentPercent).toBe(50);
    expect(deviation?.deviation).toBe(-30);
    expect(deviation?.severity).toBe("high");

    // Both BTC (targeted) and ETH (untargeted) sit above the 30% threshold.
    const concentration = alerts
      .filter((a) => a.type === "concentration_token")
      .map((a) => a.tokenSymbol)
      .sort();
    expect(concentration).toEqual(["BTC", "ETH"]);
  });
});

describe("computeAutocompleteSuggestions", () => {
  const symbolValues = { BTC: 100, BCH: 50, ETH: 10 };
  const groups: TokenGroup[] = [
    { id: "g1", name: "BTC Basket", symbols: ["BTC", "BCH"], totalValueUsd: 150 },
  ];

  it("returns nothing for an empty query", () => {
    expect(computeAutocompleteSuggestions("", symbolValues, groups)).toEqual([]);
  });

  it("matches symbols case-insensitively and includes matching groups", () => {
    const results = computeAutocompleteSuggestions("bt", symbolValues, groups);

    expect(results).toEqual([
      {
        symbol: "BTC",
        name: "BTC",
        coingeckoId: null,
        totalBalance: 0,
        totalValueUsd: 100,
      },
      {
        symbol: "BTC Basket",
        name: "Group: BTC Basket",
        coingeckoId: null,
        totalBalance: 0,
        totalValueUsd: 150,
        isGroup: true,
      },
    ]);
  });

  it("caps the result list at 10 entries", () => {
    const manyValues: Record<string, number> = {};
    for (let i = 0; i < 15; i += 1) {
      manyValues[`TOK${i}`] = i;
    }

    expect(computeAutocompleteSuggestions("TOK", manyValues, [])).toHaveLength(10);
  });
});

describe("computeCategoryBreakdown", () => {
  it("returns nothing without categories or portfolio value", () => {
    expect(computeCategoryBreakdown([], { BTC: 100 }, 100)).toEqual([]);
    expect(
      computeCategoryBreakdown(
        [{ id: "c1", tokenSymbol: "BTC", category: "large-cap" }],
        {},
        0
      )
    ).toEqual([]);
  });

  it("aggregates token values per category from vault categories", () => {
    const vault = createEmptyVault();
    vault.tokenCategories = [
      { id: "c1", tokenSymbol: "BTC", category: "large-cap", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "c2", tokenSymbol: "eth", category: "large-cap", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "c3", tokenSymbol: "USDT", category: "stablecoin", updatedAt: "2026-01-01T00:00:00.000Z" },
    ];

    const breakdown = computeCategoryBreakdown(
      vault.tokenCategories.map((c) => ({
        id: c.id,
        tokenSymbol: c.tokenSymbol,
        category: c.category,
      })),
      { BTC: 50, ETH: 30, USDT: 20 },
      100
    );

    expect(breakdown).toEqual([
      { category: "large-cap", valueUsd: 80, percent: 80 },
      { category: "stablecoin", valueUsd: 20, percent: 20 },
    ]);
  });
});
