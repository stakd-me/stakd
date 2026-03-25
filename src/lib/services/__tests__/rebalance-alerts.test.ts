import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/lib/crypto/vault-types";
import { getRebalanceAlertTokenCount } from "@/lib/services/rebalance-alerts";
import type { PriceData } from "@/lib/services/portfolio-calculator";

function createPriceMap(): Record<string, PriceData> {
  return {
    bitcoin: { usd: 100, change24h: null },
    ethereum: { usd: 100, change24h: null },
    tether: { usd: 1, change24h: null },
  };
}

describe("rebalance alert count", () => {
  it("matches unique actionable rebalance signals instead of raw target deviations", () => {
    const vault = createEmptyVault();
    vault.settings.concentrationThresholdPercent = "55";
    vault.transactions = [
      {
        id: "tx-btc",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "bitcoin",
        type: "buy",
        quantity: "6",
        pricePerUnit: "100",
        totalCost: "600",
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
        quantity: "3",
        pricePerUnit: "100",
        totalCost: "300",
        fee: "0",
        coingeckoId: "ethereum",
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
        targetPercent: 40,
        coingeckoId: "bitcoin",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "target-eth",
        tokenSymbol: "ETH",
        targetPercent: 40,
        coingeckoId: "ethereum",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "target-stablecoin",
        tokenSymbol: "STABLECOIN",
        targetPercent: 10,
        coingeckoId: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(getRebalanceAlertTokenCount(vault, createPriceMap())).toBe(2);
  });

  it("still reports concentration alerts without rebalance targets", () => {
    const vault = createEmptyVault();
    vault.settings.concentrationThresholdPercent = "50";
    vault.transactions = [
      {
        id: "tx-btc",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "bitcoin",
        type: "buy",
        quantity: "7",
        pricePerUnit: "100",
        totalCost: "700",
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
        quantity: "3",
        pricePerUnit: "100",
        totalCost: "300",
        fee: "0",
        coingeckoId: "ethereum",
        note: null,
        transactedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(getRebalanceAlertTokenCount(vault, createPriceMap())).toBe(1);
  });
});
