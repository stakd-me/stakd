import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/lib/crypto/vault-types";
import type {
  VaultAllocationSnapshot,
  VaultData,
} from "@/lib/crypto/vault-types";
import type { PriceData } from "@/lib/services/portfolio-calculator";
import {
  buildAllocationTrend,
  createWeeklyAllocationSnapshot,
  formatAllocationUpdateDate,
  getAllocationHistorySymbols,
  getAllocationPercentChange,
  getAllocationPercentMap,
  getMissingAllocationPriceTokens,
  getWeeklyAllocationUpdateTime,
  getWeeklyAllocationWeekStartKey,
  isWeeklyAllocationUpdateDue,
  upsertAllocationSnapshot,
} from "@/lib/services/allocation-history";

function createVaultWithManualHoldings(): VaultData {
  const vault = createEmptyVault();
  vault.manualEntries = [
    {
      id: "manual-btc",
      tokenSymbol: "BTC",
      tokenName: "Bitcoin",
      coingeckoId: "bitcoin",
      quantity: 1,
      note: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    {
      id: "manual-eth",
      tokenSymbol: "ETH",
      tokenName: "Ethereum",
      coingeckoId: "ethereum",
      quantity: 2,
      note: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ];
  return vault;
}

function createPriceMap(): Record<string, PriceData> {
  return {
    bitcoin: { usd: 100, change24h: null },
    ethereum: { usd: 50, change24h: null },
  };
}

describe("allocation-history", () => {
  it("uses Monday 00:01 UTC as the weekly update time", () => {
    const beforeUpdate = new Date("2026-06-22T00:00:59.000Z");
    const atUpdate = new Date("2026-06-22T00:01:00.000Z");
    const afterUpdate = new Date("2026-06-24T12:00:00.000Z");

    expect(getWeeklyAllocationWeekStartKey(afterUpdate)).toBe("2026-06-22");
    expect(getWeeklyAllocationUpdateTime(afterUpdate).toISOString()).toBe(
      "2026-06-22T00:01:00.000Z"
    );
    expect(isWeeklyAllocationUpdateDue(beforeUpdate)).toBe(false);
    expect(isWeeklyAllocationUpdateDue(atUpdate)).toBe(true);
    expect(isWeeklyAllocationUpdateDue(afterUpdate)).toBe(true);
  });

  it("creates a weekly allocation snapshot with horizontal table values", () => {
    const snapshot = createWeeklyAllocationSnapshot(
      createVaultWithManualHoldings(),
      createPriceMap(),
      new Date("2026-06-22T00:01:00.000Z"),
      () => "snapshot-1"
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.id).toBe("snapshot-1");
    expect(snapshot?.weekStart).toBe("2026-06-22");
    expect(snapshot?.updatedAt).toBe("2026-06-22T00:01:00.000Z");
    expect(snapshot?.totalValueUsd).toBe(200);
    expect(formatAllocationUpdateDate(snapshot!)).toBe("2026-06-22");

    const percentMap = getAllocationPercentMap(snapshot!);
    expect(percentMap.BTC).toBe(50);
    expect(percentMap.ETH).toBe(50);
  });

  it("replaces an existing weekly snapshot instead of duplicating it", () => {
    const first = createWeeklyAllocationSnapshot(
      createVaultWithManualHoldings(),
      createPriceMap(),
      new Date("2026-06-22T00:01:00.000Z"),
      () => "snapshot-1"
    )!;
    const replacement = {
      ...first,
      id: "snapshot-2",
      capturedAt: "2026-06-22T01:00:00.000Z",
    };

    const snapshots = upsertAllocationSnapshot([first], replacement);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].id).toBe("snapshot-2");
  });

  it("orders coin columns by newest snapshot first", () => {
    const older: VaultAllocationSnapshot = {
      id: "older",
      weekStart: "2026-06-15",
      updatedAt: "2026-06-15T00:01:00.000Z",
      capturedAt: "2026-06-15T00:01:00.000Z",
      totalValueUsd: 100,
      allocations: [
        {
          symbol: "ETH",
          tokenName: "Ethereum",
          coingeckoId: "ethereum",
          valueUsd: 60,
          percent: 60,
        },
        {
          symbol: "BTC",
          tokenName: "Bitcoin",
          coingeckoId: "bitcoin",
          valueUsd: 40,
          percent: 40,
        },
      ],
    };
    const newer: VaultAllocationSnapshot = {
      ...older,
      id: "newer",
      weekStart: "2026-06-22",
      updatedAt: "2026-06-22T00:01:00.000Z",
      allocations: [
        {
          symbol: "TAO",
          tokenName: "Bittensor",
          coingeckoId: "bittensor",
          valueUsd: 70,
          percent: 70,
        },
        {
          symbol: "BTC",
          tokenName: "Bitcoin",
          coingeckoId: "bitcoin",
          valueUsd: 30,
          percent: 30,
        },
      ],
    };

    expect(getAllocationHistorySymbols([older, newer])).toEqual([
      "TAO",
      "BTC",
      "ETH",
    ]);
  });

  it("computes percent changes against the previous snapshot", () => {
    const previous: VaultAllocationSnapshot = {
      id: "previous",
      weekStart: "2026-06-15",
      updatedAt: "2026-06-15T00:01:00.000Z",
      capturedAt: "2026-06-15T00:01:00.000Z",
      totalValueUsd: 100,
      allocations: [
        {
          symbol: "BTC",
          tokenName: "Bitcoin",
          coingeckoId: "bitcoin",
          valueUsd: 40,
          percent: 40,
        },
        {
          symbol: "ETH",
          tokenName: "Ethereum",
          coingeckoId: "ethereum",
          valueUsd: 50,
          percent: 50,
        },
        {
          symbol: "SOL",
          tokenName: "Solana",
          coingeckoId: "solana",
          valueUsd: 10,
          percent: 10,
        },
      ],
    };
    const current: VaultAllocationSnapshot = {
      ...previous,
      id: "current",
      weekStart: "2026-06-22",
      updatedAt: "2026-06-22T00:01:00.000Z",
      allocations: [
        {
          symbol: "BTC",
          tokenName: "Bitcoin",
          coingeckoId: "bitcoin",
          valueUsd: 55,
          percent: 55,
        },
        {
          symbol: "ETH",
          tokenName: "Ethereum",
          coingeckoId: "ethereum",
          valueUsd: 35,
          percent: 35,
        },
        {
          symbol: "TAO",
          tokenName: "Bittensor",
          coingeckoId: "bittensor",
          valueUsd: 10,
          percent: 10,
        },
      ],
    };
    const unchanged: VaultAllocationSnapshot = {
      ...current,
      allocations: [
        {
          symbol: "BTC",
          tokenName: "Bitcoin",
          coingeckoId: "bitcoin",
          valueUsd: 40,
          percent: 40,
        },
      ],
    };

    expect(getAllocationPercentChange(current, previous, "btc")).toBe(15);
    expect(getAllocationPercentChange(current, previous, "ETH")).toBe(-15);
    expect(getAllocationPercentChange(current, previous, "TAO")).toBe(10);
    expect(getAllocationPercentChange(current, previous, "SOL")).toBeNull();
    expect(getAllocationPercentChange(current, null, "BTC")).toBeNull();
    expect(getAllocationPercentChange(unchanged, previous, "BTC")).toBe(0);
  });

  it("detects active holdings with missing prices", () => {
    const missing = getMissingAllocationPriceTokens(
      createVaultWithManualHoldings(),
      { bitcoin: { usd: 100, change24h: null } }
    );

    expect(missing).toEqual([{ coingeckoId: "ethereum", symbol: "ETH" }]);
  });

  describe("buildAllocationTrend", () => {
    const makeSnapshot = (
      weekStart: string,
      allocations: { symbol: string; percent: number }[]
    ): VaultAllocationSnapshot => ({
      id: `snap-${weekStart}`,
      weekStart,
      updatedAt: `${weekStart}T00:01:00.000Z`,
      capturedAt: `${weekStart}T00:01:00.000Z`,
      totalValueUsd: 1000,
      allocations: allocations.map(({ symbol, percent }) => ({
        symbol,
        tokenName: symbol,
        coingeckoId: null,
        valueUsd: (percent / 100) * 1000,
        percent,
      })),
    });

    it("orders weeks ascending and series by average percent descending", () => {
      const trend = buildAllocationTrend([
        makeSnapshot("2026-06-29", [
          { symbol: "BTC", percent: 60 },
          { symbol: "ETH", percent: 40 },
        ]),
        makeSnapshot("2026-06-22", [
          { symbol: "BTC", percent: 50 },
          { symbol: "ETH", percent: 50 },
        ]),
      ]);

      expect(trend.weeks).toEqual(["2026-06-22", "2026-06-29"]);
      expect(trend.series.map((s) => s.symbol)).toEqual(["BTC", "ETH"]);
      expect(trend.series[0].percents).toEqual([50, 60]);
      expect(trend.series[1].percents).toEqual([50, 40]);
    });

    it("fills missing weeks with zero for tokens absent from a snapshot", () => {
      const trend = buildAllocationTrend([
        makeSnapshot("2026-06-22", [{ symbol: "BTC", percent: 100 }]),
        makeSnapshot("2026-06-29", [
          { symbol: "BTC", percent: 70 },
          { symbol: "SOL", percent: 30 },
        ]),
      ]);

      const sol = trend.series.find((s) => s.symbol === "SOL");
      expect(sol?.percents).toEqual([0, 30]);
    });

    it("folds tokens beyond maxSeries into a single others series", () => {
      const trend = buildAllocationTrend(
        [
          makeSnapshot("2026-06-22", [
            { symbol: "BTC", percent: 40 },
            { symbol: "ETH", percent: 30 },
            { symbol: "SOL", percent: 20 },
            { symbol: "DOGE", percent: 10 },
          ]),
        ],
        2
      );

      expect(trend.series).toHaveLength(3);
      expect(trend.series.map((s) => s.symbol)).toEqual(["BTC", "ETH", ""]);
      const others = trend.series[2];
      expect(others.isOthers).toBe(true);
      expect(others.percents).toEqual([30]);
    });

    it("returns no others series when everything fits", () => {
      const trend = buildAllocationTrend([
        makeSnapshot("2026-06-22", [
          { symbol: "BTC", percent: 60 },
          { symbol: "ETH", percent: 40 },
        ]),
      ]);

      expect(trend.series.some((s) => s.isOthers)).toBe(false);
    });
  });
});
