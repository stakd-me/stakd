import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/lib/crypto/vault-types";
import {
  calculatePortfolioTotal,
  getHoldings,
  getPortfolioSummary,
  getTokenAllocations,
  type PriceData,
} from "@/lib/services/portfolio-calculator";
import {
  buildTradeSettlement,
  createVaultTransaction,
} from "@/lib/transactions";

function createSampleVault() {
  const vault = createEmptyVault();
  vault.transactions = [
    {
      id: "tx-buy-btc",
      tokenSymbol: "BTC",
      tokenName: "Bitcoin",
      chain: "bitcoin",
      type: "buy",
      quantity: "2",
      pricePerUnit: "100",
      totalCost: "200",
      fee: "10",
      coingeckoId: "bitcoin",
      note: null,
      transactedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "tx-sell-btc",
      tokenSymbol: "BTC",
      tokenName: "Bitcoin",
      chain: "bitcoin",
      type: "sell",
      quantity: "0.5",
      pricePerUnit: "150",
      totalCost: "75",
      fee: "5",
      coingeckoId: "bitcoin",
      note: null,
      transactedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "tx-receive-eth",
      tokenSymbol: "ETH",
      tokenName: "Ethereum",
      chain: "ethereum",
      type: "receive",
      quantity: "1",
      pricePerUnit: "0",
      totalCost: "0",
      fee: "0",
      coingeckoId: "ethereum",
      note: null,
      transactedAt: "2026-01-03T00:00:00.000Z",
      createdAt: "2026-01-03T00:00:00.000Z",
    },
  ];
  vault.manualEntries = [
    {
      id: "manual-btc",
      tokenSymbol: "BTC",
      tokenName: "Bitcoin",
      coingeckoId: "bitcoin",
      quantity: 0.5,
      note: null,
      createdAt: "2026-01-04T00:00:00.000Z",
      updatedAt: "2026-01-04T00:00:00.000Z",
    },
  ];

  return vault;
}

function createPriceMap(): Record<string, PriceData> {
  return {
    bitcoin: { usd: 120, change24h: 1.2 },
    ethereum: { usd: 50, change24h: -0.4 },
  };
}

describe("portfolio-calculator", () => {
  it("calculates holdings from transactions and manual entries", () => {
    const holdings = getHoldings(createSampleVault(), createPriceMap());

    expect(holdings).toHaveLength(2);
    expect(holdings[0].symbol).toBe("BTC");
    expect(holdings[1].symbol).toBe("ETH");

    const btc = holdings[0];
    expect(btc.currentQty).toBeCloseTo(2);
    expect(btc.avgCostBasis).toBeCloseTo(105);
    expect(btc.totalFees).toBeCloseTo(15);
    expect(btc.realizedPL).toBeCloseTo(17.5);
    expect(btc.currentValue).toBeCloseTo(240);
    expect(btc.unrealizedPL).toBeCloseTo(30);

    const eth = holdings[1];
    expect(eth.currentQty).toBeCloseTo(1);
    expect(eth.currentValue).toBeCloseTo(50);
    expect(eth.avgCostBasis).toBe(0);
  });

  it("computes summary totals and allocation helpers", () => {
    const vault = createSampleVault();
    const prices = createPriceMap();

    const summary = getPortfolioSummary(vault, prices);
    const allocations = getTokenAllocations(vault, prices);
    const total = calculatePortfolioTotal(vault, prices);

    expect(summary.totalValueUsd).toBeCloseTo(290);
    expect(summary.symbolValues.BTC).toBeCloseTo(240);
    expect(summary.symbolValues.ETH).toBeCloseTo(50);
    expect(total).toBeCloseTo(290);
    expect(allocations).toHaveLength(2);
    expect(allocations[0].percent + allocations[1].percent).toBeCloseTo(100);
  });

  it("does not count send transfers as realized sells", () => {
    const vault = createEmptyVault();
    vault.transactions = [
      {
        id: "tx-buy-btc-only",
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
        id: "tx-send-btc-only",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "bitcoin",
        type: "send",
        quantity: "0.4",
        pricePerUnit: "0",
        totalCost: "0",
        fee: "0",
        coingeckoId: "bitcoin",
        note: null,
        transactedAt: "2026-01-02T00:00:00.000Z",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ];

    const holdings = getHoldings(vault, {
      bitcoin: { usd: 120, change24h: null },
    });

    expect(holdings).toHaveLength(1);
    expect(holdings[0].currentQty).toBeCloseTo(0.6);
    expect(holdings[0].realizedPL).toBeCloseTo(0);
    expect(holdings[0].currentValue).toBeCloseTo(72);
  });

  it("updates stablecoin holdings from embedded settlement legs", () => {
    const vault = createEmptyVault();
    vault.transactions = [
      createVaultTransaction({
        id: "fund-usdt",
        tokenSymbol: "USDT",
        tokenName: "Tether",
        chain: "",
        type: "buy",
        quantity: 100000,
        pricePerUnit: 1,
        fee: 0,
        coingeckoId: "tether",
        note: null,
        transactedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      createVaultTransaction({
        id: "buy-btc-with-usdt",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "",
        type: "buy",
        quantity: 1,
        pricePerUnit: 69000,
        fee: 0,
        coingeckoId: "bitcoin",
        note: null,
        transactedAt: "2026-01-02T00:00:00.000Z",
        createdAt: "2026-01-02T00:00:00.000Z",
        settlement: buildTradeSettlement({
          settlement: {
            tokenSymbol: "USDT",
            tokenName: "Tether",
            coingeckoId: "tether",
          },
          type: "buy",
          totalCost: 69000,
          fee: 0,
          pricePerUnit: 1,
        }),
      }),
      createVaultTransaction({
        id: "sell-btc-to-usdt",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "",
        type: "sell",
        quantity: 0.25,
        pricePerUnit: 70000,
        fee: 0,
        coingeckoId: "bitcoin",
        note: null,
        transactedAt: "2026-01-03T00:00:00.000Z",
        createdAt: "2026-01-03T00:00:00.000Z",
        settlement: buildTradeSettlement({
          settlement: {
            tokenSymbol: "USDT",
            tokenName: "Tether",
            coingeckoId: "tether",
          },
          type: "sell",
          totalCost: 17500,
          fee: 0,
          pricePerUnit: 1,
        }),
      }),
    ];

    const holdings = getHoldings(vault, {
      bitcoin: { usd: 70000, change24h: null },
      tether: { usd: 1, change24h: null },
    });

    const btc = holdings.find((holding) => holding.symbol === "BTC");
    const usdt = holdings.find((holding) => holding.symbol === "USDT");

    expect(btc?.currentQty).toBeCloseTo(0.75);
    expect(usdt?.currentQty).toBeCloseTo(48500);
    expect(usdt?.avgCostBasis).toBeCloseTo(1);
  });
});
