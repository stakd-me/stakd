import { describe, expect, it } from "vitest";
import { rankTokenSearchResults } from "@/lib/search/token-search";

describe("rankTokenSearchResults", () => {
  it("prioritizes canonical SOL over bridged/pegged variants", () => {
    const tokens = [
      {
        id: "binance-peg-sol",
        symbol: "sol",
        name: "Binance-Peg SOL",
        binance: true,
      },
      {
        id: "base-bridged-sol-base",
        symbol: "sol",
        name: "Base Bridged SOL (Base)",
        binance: true,
      },
      {
        id: "solana",
        symbol: "sol",
        name: "Solana",
        binance: true,
      },
    ];

    const ranked = rankTokenSearchResults(tokens, "sol", 5);
    expect(ranked[0]?.id).toBe("solana");
  });

  it("prioritizes canonical BTC for ticker query", () => {
    const tokens = [
      {
        id: "btc-dex",
        symbol: "btc",
        name: "BTC DEX",
        binance: false,
      },
      {
        id: "bitcoin",
        symbol: "btc",
        name: "Bitcoin",
        binance: true,
      },
      {
        id: "btc-proxy",
        symbol: "btc",
        name: "BTC Proxy",
        binance: false,
      },
    ];

    const ranked = rankTokenSearchResults(tokens, "btc", 5);
    expect(ranked[0]?.id).toBe("bitcoin");
  });

  it("returns empty list for empty query", () => {
    const tokens = [
      {
        id: "solana",
        symbol: "sol",
        name: "Solana",
        binance: true,
      },
    ];

    expect(rankTokenSearchResults(tokens, "", 10)).toEqual([]);
    expect(rankTokenSearchResults(tokens, "   ", 10)).toEqual([]);
  });
});
