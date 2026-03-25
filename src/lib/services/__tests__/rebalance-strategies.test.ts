import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/lib/crypto/vault-types";
import type { PriceData } from "@/lib/services/portfolio-calculator";
import {
  buildStrategyContext,
  computeCalendarSuggestions,
  computeThresholdSuggestions,
  computeDcaSuggestions,
} from "@/lib/services/rebalance-strategies";

function createSamplePriceMap(): Record<string, PriceData> {
  return {
    bitcoin: { usd: 100, change24h: null },
    ethereum: { usd: 100, change24h: null },
    tether: { usd: 1, change24h: null },
  };
}

function createRebalanceVault() {
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
  ];
  vault.rebalanceTargets = [
    {
      id: "target-eth",
      tokenSymbol: "ETH",
      targetPercent: 100,
      coingeckoId: "ethereum",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  return vault;
}

describe("rebalance-strategies", () => {
  it("handles invalid calendar date settings without crashing", () => {
    const context = buildStrategyContext(
      createRebalanceVault(),
      createSamplePriceMap()
    );
    const output = computeCalendarSuggestions(context, {
      rebalanceInterval: "monthly",
      lastRebalanceDate: "not-a-date",
    });

    expect(output.calendarBlocked).toBe(false);
    expect(output.nextRebalanceDate).toBeNull();
    expect(output.suggestions).toHaveLength(1);
    expect(output.suggestions[0].action).toBe("buy");
  });

  it("clamps invalid DCA settings to safe minimums", () => {
    const context = buildStrategyContext(
      createRebalanceVault(),
      createSamplePriceMap()
    );
    const output = computeDcaSuggestions(context, {
      dcaSplitCount: "0",
      dcaIntervalDays: "0",
    });

    expect(output.dcaTotalChunks).toBe(1);
    expect(output.dcaIntervalDays).toBe(1);
    expect(output.suggestions).toHaveLength(1);
    expect(Number.isFinite(output.suggestions[0].amount)).toBe(true);
    expect(output.suggestions[0].amount).toBeCloseTo(100);
    expect(output.dcaChunks).toHaveLength(1);
    expect(output.dcaChunks?.[0].trades[0].amount).toBeCloseTo(100);
  });

  it("treats stablecoins as reserve capital when enabled", () => {
    const vault = createEmptyVault();
    vault.settings.treatStablecoinsAsCashReserve = "1";
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
        id: "tx-usdt",
        tokenSymbol: "USDT",
        tokenName: "Tether",
        chain: "ethereum",
        type: "buy",
        quantity: "100",
        pricePerUnit: "1",
        totalCost: "100",
        fee: "0",
        coingeckoId: "tether",
        note: null,
        transactedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    vault.rebalanceTargets = [
      {
        id: "target-btc",
        tokenSymbol: "BTC",
        targetPercent: 100,
        coingeckoId: "bitcoin",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const context = buildStrategyContext(vault, createSamplePriceMap());
    expect(context.totalValue).toBeCloseTo(100);
    expect(context.symbolValues.USDT).toBeUndefined();

    const output = computeThresholdSuggestions(context);
    expect(output.suggestions).toHaveLength(1);
    expect(output.suggestions[0].tokenSymbol).toBe("BTC");
    expect(output.suggestions[0].action).toBe("hold");
  });

  it("aggregates STABLECOIN targets from underlying stablecoin holdings", () => {
    const vault = createEmptyVault();
    vault.transactions = [
      {
        id: "tx-btc",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "bitcoin",
        type: "buy",
        quantity: "0.931",
        pricePerUnit: "100",
        totalCost: "93.1",
        fee: "0",
        coingeckoId: "bitcoin",
        note: null,
        transactedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "tx-usdt",
        tokenSymbol: "USDT",
        tokenName: "Tether",
        chain: "ethereum",
        type: "buy",
        quantity: "6.9",
        pricePerUnit: "1",
        totalCost: "6.9",
        fee: "0",
        coingeckoId: "tether",
        note: null,
        transactedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    vault.rebalanceTargets = [
      {
        id: "target-stablecoin",
        tokenSymbol: "STABLECOIN",
        targetPercent: 10,
        coingeckoId: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const context = buildStrategyContext(vault, createSamplePriceMap());
    const output = computeThresholdSuggestions(context);

    expect(output.suggestions).toHaveLength(1);
    expect(output.suggestions[0]).toMatchObject({
      tokenSymbol: "STABLECOIN",
      targetPercent: 10,
      currentPercent: 6.9,
      currentValue: 6.9,
      deviation: -3.1,
    });
  });

  it("matches trimmed group names when resolving grouped targets", () => {
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
    ];
    vault.tokenGroups = [
      {
        id: "group-core",
        name: " CORE ",
        symbols: [" btc "],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    vault.rebalanceTargets = [
      {
        id: "target-core",
        tokenSymbol: "CORE",
        targetPercent: 100,
        coingeckoId: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const context = buildStrategyContext(vault, createSamplePriceMap());
    const output = computeThresholdSuggestions(context);

    expect(output.suggestions).toHaveLength(1);
    expect(output.suggestions[0]).toMatchObject({
      tokenSymbol: "CORE",
      currentPercent: 100,
      currentValue: 100,
      deviation: 0,
      action: "hold",
    });
  });
});
