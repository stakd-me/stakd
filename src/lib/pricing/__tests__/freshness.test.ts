import { describe, expect, it } from "vitest";
import { getOldestPriceUpdateForTokens } from "@/lib/pricing/freshness";

describe("price freshness helper", () => {
  it("prefers Binance-eligible tokens when present", () => {
    const oldest = getOldestPriceUpdateForTokens(
      {
        bitcoin: { usd: 100_000, change24h: 1, updatedAt: "2026-02-23T10:00:00.000Z" },
        "some-coingecko-only-coin": { usd: 1, change24h: 1, updatedAt: "2026-02-23T08:00:00.000Z" },
      },
      [
        { coingeckoId: "bitcoin", symbol: "BTC" },
        { coingeckoId: "some-coingecko-only-coin", symbol: "SCC" },
      ]
    );

    expect(oldest).toBe("2026-02-23T10:00:00.000Z");
  });

  it("falls back to all tokens when none are Binance-eligible", () => {
    const oldest = getOldestPriceUpdateForTokens(
      {
        "coin-a": { usd: 1, change24h: 1, updatedAt: "2026-02-23T09:30:00.000Z" },
        "coin-b": { usd: 2, change24h: 1, updatedAt: "2026-02-23T08:30:00.000Z" },
      },
      [
        { coingeckoId: "coin-a", symbol: "AAA" },
        { coingeckoId: "coin-b", symbol: "BBB" },
      ]
    );

    expect(oldest).toBe("2026-02-23T08:30:00.000Z");
  });

  it("normalizes coingecko ids before lookup", () => {
    const oldest = getOldestPriceUpdateForTokens(
      {
        ethereum: { usd: 3_000, change24h: 1, updatedAt: "2026-02-23T11:00:00.000Z" },
      },
      [{ coingeckoId: " Ethereum ", symbol: "ETH" }]
    );

    expect(oldest).toBe("2026-02-23T11:00:00.000Z");
  });
});
