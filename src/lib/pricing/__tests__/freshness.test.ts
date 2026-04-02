import { describe, expect, it } from "vitest";
import { getOldestPriceUpdateForTokens } from "@/lib/pricing/freshness";

describe("price freshness helper", () => {
  it("returns the newest updatedAt across all tokens", () => {
    const newest = getOldestPriceUpdateForTokens(
      {
        bitcoin: { usd: 100_000, change24h: 1, updatedAt: "2026-02-23T10:00:00.000Z" },
        "some-coingecko-only-coin": { usd: 1, change24h: 1, updatedAt: "2026-02-23T08:00:00.000Z" },
      },
      [
        { coingeckoId: "bitcoin", symbol: "BTC" },
        { coingeckoId: "some-coingecko-only-coin", symbol: "SCC" },
      ]
    );

    expect(newest).toBe("2026-02-23T10:00:00.000Z");
  });

  it("returns newest when no tokens are Binance-eligible", () => {
    const newest = getOldestPriceUpdateForTokens(
      {
        "coin-a": { usd: 1, change24h: 1, updatedAt: "2026-02-23T09:30:00.000Z" },
        "coin-b": { usd: 2, change24h: 1, updatedAt: "2026-02-23T08:30:00.000Z" },
      },
      [
        { coingeckoId: "coin-a", symbol: "AAA" },
        { coingeckoId: "coin-b", symbol: "BBB" },
      ]
    );

    expect(newest).toBe("2026-02-23T09:30:00.000Z");
  });

  it("normalizes coingecko ids before lookup", () => {
    const newest = getOldestPriceUpdateForTokens(
      {
        ethereum: { usd: 3_000, change24h: 1, updatedAt: "2026-02-23T11:00:00.000Z" },
      },
      [{ coingeckoId: " Ethereum ", symbol: "ETH" }]
    );

    expect(newest).toBe("2026-02-23T11:00:00.000Z");
  });
});
